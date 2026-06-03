using System;
using System.IO;
using System.Text.Json;
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
                    using (JsonDocument doc = JsonDocument.Parse(json))
                    {
                        foreach (JsonProperty prop in doc.RootElement.EnumerateObject())
                        {
                            _config[prop.Name] = prop.Value.GetString() ?? "";
                        }
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
