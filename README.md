# Carousel Builder

Instagram carousel builder в стиле @dmitriymarketing.
Canvas-based рендер 1080×1350, экспорт PNG в ZIP.

## Локальный запуск

Двойной клик по `run.bat` → откроется в браузере на <http://localhost:8765/>

## Деплой на Railway

1. Создай новый проект: <https://railway.app/new>
2. Deploy from GitHub repo → выбери `carousel-builder`
3. Railway автоматически запустит `npm install` и `npm start`
4. Готово — публичный URL появится в Settings → Domains

## Стек

- Single-file React app (no JSX, no Babel)
- Canvas-based slide rendering
- LocalStorage для сохранения проекта
- JSZip + FileSaver для экспорта
