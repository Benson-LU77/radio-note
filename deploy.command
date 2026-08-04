#!/bin/zsh
# Tata — 雙擊這個檔案就會打包網頁並發佈到 GitHub Pages
cd "$(dirname "$0")"

echo "🌃  Tata — 打包並發佈中…"
echo ""

if npm run deploy; then
  echo ""
  echo "✅ 發佈完成！網址（首次或更新後約 1–2 分鐘生效）："
  echo "   https://benson-lu77.github.io/tata/"
else
  echo ""
  echo "❌ 發佈失敗，請截圖上面的錯誤訊息。"
fi
echo ""
read -k 1 "?按任意鍵關閉…"
