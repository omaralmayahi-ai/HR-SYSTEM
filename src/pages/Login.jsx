import React, { useState } from "react";
import { apiClient } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, User, Lock, Loader2, ShieldCheck } from "lucide-react";

export default function Login() {
  const { appPublicSettings } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Dynamic branding parameters
  const primaryColor = appPublicSettings?.primaryColor || '#1B3A6B';
  const platformName = appPublicSettings?.platformName || 'نظام إدارة الموارد البشرية والرواتب';
  const beneficiaryName = appPublicSettings?.beneficiaryName || 'وزارة الموارد البشرية العراقية';
  const copyrightText = appPublicSettings?.copyrightText || 'جميع الحقوق محفوظة © 2026';
  const logoUrl = appPublicSettings?.logoUrl || 'https://img.icons8.com/color/96/gender-neutral-user.png';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiClient.auth.loginViaEmailPassword(username, password);
      window.location.href = "/";
    } catch (err) {
      setError(err.message || "اسم المستخدم أو كلمة المرور غير صحيحة");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-slate-50 overflow-hidden px-4 py-12" dir="rtl">
      {/* Decorative background shapes matching the image design */}
      <div 
        className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-10 pointer-events-none" 
        style={{ backgroundColor: primaryColor }}
      />
      <div 
        className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-10 pointer-events-none" 
        style={{ backgroundColor: primaryColor }}
      />

      <div className="w-full max-w-[460px] relative z-10">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
          
          {/* Card Header matching the top half in the photo */}
          <div 
            className="p-8 text-center text-white relative transition-all duration-300" 
            style={{ backgroundColor: primaryColor }}
          >
            {/* Logo box */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 shadow-inner mb-4">
              {logoUrl ? (
                <img 
                  src={logoUrl} 
                  alt="App Logo" 
                  className="max-w-full max-h-full object-contain rounded-xl p-1"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <LogIn className="w-8 h-8 text-white" />
              )}
            </div>

            {/* Platform & Beneficiary Titles */}
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white mb-1.5 drop-shadow-sm">
              {platformName}
            </h1>
            <p className="text-white/80 text-xs md:text-sm font-medium">
              {beneficiaryName}
            </p>
          </div>

          {/* Form Block (bottom half) */}
          <div className="p-8 bg-white text-right">
            {error && (
              <div className="mb-6 p-3.5 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-semibold text-right flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 animate-ping" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Username field */}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs font-bold text-slate-700 block">
                  اسم المستخدم للمسؤول أو القسم
                </Label>
                <div className="relative">
                  <User className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                  <Input
                    id="username"
                    type="text"
                    autoFocus
                    placeholder="مثال: admin أو general"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pr-10 h-11 text-right text-xs md:text-sm border-slate-200 focus:border-[var(--primary-custom)] focus-visible:ring-[var(--primary-custom)] rounded-xl bg-slate-50/50 hover:bg-slate-50 focus:bg-white transition-all"
                    required
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="password" className="text-xs font-bold text-slate-700 block">
                    كلمة المرور
                  </Label>
                  <span className="text-[10px] text-slate-400 hover:underline cursor-pointer">
                    نسيت كلمة المرور؟
                  </span>
                </div>
                <div className="relative">
                  <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10 h-11 text-right text-xs md:text-sm border-slate-200 focus:border-[var(--primary-custom)] focus-visible:ring-[var(--primary-custom)] rounded-xl bg-slate-50/50 hover:bg-slate-50 focus:bg-white transition-all"
                    required
                  />
                </div>
              </div>

              {/* Submit Button */}
              <Button 
                type="submit" 
                className="w-full h-11 font-bold text-sm md:text-base mt-2 rounded-xl text-white shadow-md hover:shadow-lg transition-all gap-2" 
                style={{ backgroundColor: primaryColor }}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جاري التحقق...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 ml-1" />
                    <span>تسجيل دخول آمن للمنصة</span>
                  </>
                )}
              </Button>
            </form>

            {/* Copyright/Footer Text */}
            <div className="mt-8 text-center border-t border-slate-100 pt-5">
              <p className="text-[10px] text-slate-400 font-medium">
                {copyrightText}
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
