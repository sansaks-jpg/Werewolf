using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Collections.Generic;

namespace Database
{
    public static class SettingsHelper
    {
        private static Dictionary<string, string> _config = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        static SettingsHelper()
        {
            try
            {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string configPath = Path.Combine(baseDir, "config.json");
                
                // Cari di folder parent jika di base directory tidak ada
                if (!File.Exists(configPath))
                {
                    string parentDir = Path.GetDirectoryName(baseDir);
                    while (parentDir != null)
                    {
                        string tempPath = Path.Combine(parentDir, "config.json");
                        if (File.Exists(tempPath))
                        {
                            configPath = tempPath;
                            break;
                        }
                        parentDir = Path.GetDirectoryName(parentDir);
                    }
                }

                if (File.Exists(configPath))
                {
                    string json = File.ReadAllText(configPath);
                    // Match pattern: "key": "value"
                    var matches = Regex.Matches(json, @"""([^""]+)""\s*:\s*""([^""]*)""");
                    foreach (Match match in matches)
                    {
                        string key = match.Groups[1].Value;
                        string val = match.Groups[2].Value;
                        // Unescape simple JSON strings
                        val = val.Replace("\\\\", "\\").Replace("\\\"", "\"").Replace("\\/", "/").Replace("\\n", "\n").Replace("\\t", "\t");
                        _config[key] = val;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Gagal membaca config.json: " + ex.Message);
            }
        }

        public static string GetValue(string key, string defaultValue = "")
        {
            if (_config.TryGetValue(key, out string val))
            {
                return val;
            }
            return defaultValue;
        }
    }
}
