using System;
using Microsoft.Win32;

namespace Database
{
    public static class RegHelper
    {
        public static string GetRegValue(string key)
        {
            // Coba ambil dari config.json terlebih dahulu
            string val = SettingsHelper.GetValue(key);
            if (!string.IsNullOrEmpty(val))
            {
                return val;
            }

            // Fallback ke Registry jika berjalan di Windows
            try
            {
                if (Environment.OSVersion.Platform == PlatformID.Win32NT)
                {
                    using (var regKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64).OpenSubKey("SOFTWARE\\Werewolf"))
                    {
                        if (regKey != null)
                        {
                            return regKey.GetValue(key, "").ToString();
                        }
                    }
                }
            }
            catch { }

            return "";
        }
        public static string DBConnString => GetRegValue("DBConnectionString");
    }
}
