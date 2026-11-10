-- B4c: كل تغيير على الحقول المتتبعة بصف الموظف يُسجَّل بالسجل المؤرخ، من أي مسار كان
-- (تعديل البيانات، الاعتماد الدفعي، النقل، الشهادات...). applyMovement() يعطّل الالتقاط لأنه
-- يسجّل بنفسه (hr.skip_history). مسارات الكود تكدر تضيف سبباً بـ set_config('hr.reason', ..., true).

CREATE OR REPLACE FUNCTION hr_try_date(v text) RETURNS date AS $$
BEGIN
  IF v IS NULL OR v !~ '^\d{4}-\d{2}-\d{2}' THEN RETURN NULL; END IF;
  RETURN substring(v FROM 1 FOR 10)::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;--> statement-breakpoint

CREATE OR REPLACE FUNCTION employee_history_capture() RETURNS trigger AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Baghdad')::date;
  reason text := NULLIF(current_setting('hr.reason', true), '');
  by_user text := NULLIF(current_setting('hr.user', true), '');
  snap jsonb := to_jsonb(OLD) - 'photo';
  order_id integer := NULL;
  src text := 'تعديل مباشر';
  f text; old_v jsonb; new_v jsonb; eff date; known date;
BEGIN
  IF COALESCE(current_setting('hr.skip_history', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  -- أمر الحالة المدخل مع تغيير الحالة يُسجَّل أمراً إدارياً ويرتبط بالحركة
  IF NEW.status IS DISTINCT FROM OLD.status AND NULLIF(btrim(NEW.status_order_number), '') IS NOT NULL THEN
    INSERT INTO administrative_orders (order_number, order_date, order_kind, created_by)
    VALUES (btrim(NEW.status_order_number), COALESCE(hr_try_date(NEW.status_order_date), today), 'تغيير حالة', by_user)
    ON CONFLICT (order_number, order_date, coalesce(issuer, '')) DO NOTHING;
    SELECT id INTO order_id FROM administrative_orders
     WHERE order_number = btrim(NEW.status_order_number)
       AND order_date = COALESCE(hr_try_date(NEW.status_order_date), today)
       AND issuer IS NULL
     LIMIT 1;
  END IF;

  FOREACH f IN ARRAY ARRAY['grade','step','job_title','department','section','work_location','status','service_type','primary_responsibility','acting_responsibility'] LOOP
    old_v := to_jsonb(OLD) -> f;
    new_v := to_jsonb(NEW) -> f;
    IF old_v IS NOT DISTINCT FROM new_v THEN CONTINUE; END IF;
    IF (old_v IS NULL OR old_v = 'null'::jsonb OR old_v = '""'::jsonb) AND (new_v IS NULL OR new_v = 'null'::jsonb OR new_v = '""'::jsonb) THEN CONTINUE; END IF;

    -- تاريخ النفاذ: التاريخ المرافق للتغيير إذا تغيّر معه، وإلا اليوم
    eff := CASE f
      WHEN 'grade' THEN CASE WHEN NEW.last_promotion_date IS DISTINCT FROM OLD.last_promotion_date THEN hr_try_date(NEW.last_promotion_date)
                             WHEN NEW.grade_date IS DISTINCT FROM OLD.grade_date THEN hr_try_date(NEW.grade_date) END
      WHEN 'step' THEN CASE WHEN NEW.last_increment_date IS DISTINCT FROM OLD.last_increment_date THEN hr_try_date(NEW.last_increment_date)
                            WHEN NEW.last_promotion_date IS DISTINCT FROM OLD.last_promotion_date THEN hr_try_date(NEW.last_promotion_date) END
      WHEN 'status' THEN CASE WHEN NEW.status_order_date IS DISTINCT FROM OLD.status_order_date THEN hr_try_date(NEW.status_order_date) END
      ELSE NULL END;
    eff := COALESCE(eff, today);

    -- سجل الأساس (ق-4) قبل أول حركة على الحقل: القيمة القديمة بتاريخها المعروف أو بلا تاريخ
    IF old_v IS NOT NULL AND old_v <> 'null'::jsonb AND old_v <> '""'::jsonb
       AND NOT EXISTS (SELECT 1 FROM employee_field_history h WHERE h.employee_id = OLD.id AND h.field = f) THEN
      known := CASE f
        WHEN 'grade' THEN COALESCE(hr_try_date(OLD.grade_date), hr_try_date(OLD.last_promotion_date))
        WHEN 'step' THEN hr_try_date(OLD.last_increment_date)
        WHEN 'status' THEN hr_try_date(OLD.status_order_date)
        ELSE NULL END;
      INSERT INTO employee_field_history (employee_id, field, value, valid_from, source, reason, snapshot, recorded_by)
      VALUES (OLD.id, f, old_v, CASE WHEN known < eff THEN known END, 'تقديري', 'سجل أساس تقديري (ق-4)', snap, by_user);
    END IF;

    INSERT INTO employee_field_history (employee_id, field, value, valid_from, order_id, source, reason, snapshot, recorded_by)
    VALUES (OLD.id, f, CASE WHEN new_v = '""'::jsonb THEN 'null'::jsonb ELSE new_v END, eff,
            CASE WHEN f = 'status' THEN order_id END,
            CASE WHEN f = 'status' AND order_id IS NOT NULL THEN 'أمر' ELSE src END,
            reason, snap, by_user);
  END LOOP;

  -- تسوية/تعديل تاريخ آخر ترفيع بلا تغيير درجة: حدث بالسجل
  IF NEW.last_promotion_date IS DISTINCT FROM OLD.last_promotion_date AND NEW.grade IS NOT DISTINCT FROM OLD.grade THEN
    INSERT INTO employee_field_history (employee_id, field, value, valid_from, source, reason, snapshot, recorded_by)
    VALUES (OLD.id, 'event', to_jsonb('تغيير تاريخ آخر ترفيع إلى ' || COALESCE(NEW.last_promotion_date, 'فارغ')),
            COALESCE(hr_try_date(NEW.last_promotion_date), today), src, reason, snap, by_user);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER employees_history_capture
  AFTER UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION employee_history_capture();
