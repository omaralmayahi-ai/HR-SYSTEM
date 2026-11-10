-- B3: الواجهة ترسل «المحافظة» لموقع العمل لكن العمود لم يكن موجوداً فكانت القيمة تُهمل بصمت.
ALTER TABLE "work_locations" ADD COLUMN IF NOT EXISTS "province" text;
