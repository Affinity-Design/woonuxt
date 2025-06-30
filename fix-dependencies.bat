@echo off
echo Cleaning node_modules and cache...
rmdir /s /q node_modules
rmdir /s /q .nuxt
del package-lock.json

echo Installing dependencies...
npm install

echo Done! Try running npm run dev:ssl again.
