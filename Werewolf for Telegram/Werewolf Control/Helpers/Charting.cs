using System;
using System.Collections.Generic;
using System.Data;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Database;
using Telegram.Bot;
using Telegram.Bot.Types;
using Werewolf_Control.Handler;
using Werewolf_Control.Models;

namespace Werewolf_Control.Helpers
{
    public static class Charting
    {
        public static void TeamWinChart(string input, Update u)
        {
            Bot.Api.SendTextMessageAsync(chatId: u.Message.Chat.Id, text: "Fitur grafik visual dinonaktifkan untuk kompatibilitas Linux.", messageThreadId: u.Message.MessageThreadId);
        }
    }

    class TeamWinResult
    {
        public int Players { get; set; }
        public Decimal Wins { get; set; }
        public int Games { get; set; }
        public string Team { get; set; }
    }
}
