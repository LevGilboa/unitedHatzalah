---
description: איך לפרוס את האפליקציה ל-GitHub Pages
---

# Deploy to GitHub Pages Workflow

מדריך מפורט לפריסת האפליקציה ל-GitHub Pages.

## דרישות מוקדמות

1. וודא שיש לך Git repository מחובר ל-GitHub
2. וודא שהגדרת את ה-homepage ב-`package.json` (כבר מוגדר: `https://levgilboa.github.io/unitedHatzalah`)
3. וודא שכל השינויים שלך committed

## אופציה 1: פריסה לתיקיית `docs` (מומלץ)

שיטה זו משתמשת בתיקיית `docs` ומאפשרת לך לראות את הקבצים שנפרסו ב-repository.

### שלב 1: בנה את האפליקציה
```
npm run build:docs
```
פקודה זו:
- בונה את האפליקציה ל-production
- שומרת את הקבצים בתיקיית `docs`
- מוסיפה קובץ `.nojekyll` (כבר קיים)

### שלב 2: בדוק את הבנייה מקומית (אופציונלי)
```
npx serve docs
```
פתח את הדפדפן ב-`http://localhost:3000` כדי לבדוק שהכל עובד.

### שלב 3: פרוס ל-GitHub
```
npm run deploy:docs
```
פקודה זו:
- מריצה את `build:docs`
- מוסיפה את תיקיית `docs` ל-Git
- עושה commit עם ההודעה "Deploy to GitHub Pages"
- דוחפת ל-branch `main`

### שלב 4: הגדר GitHub Pages (פעם אחת בלבד)
1. עבור ל-repository שלך ב-GitHub
2. לחץ על **Settings** > **Pages**
3. תחת **Source**, בחר **Deploy from a branch**
4. תחת **Branch**, בחר `main` ו-`/docs`
5. לחץ **Save**

אחרי כמה דקות, האתר שלך יהיה זמין ב:
`https://levgilboa.github.io/unitedHatzalah`

---

## אופציה 2: פריסה עם gh-pages branch

שיטה זו משתמשת ב-branch נפרד בשם `gh-pages`.

### שלב 1: בנה ופרוס
```
npm run deploy:gh
```
פקודה זו:
- בונה את האפליקציה לתיקיית `dist`
- יוצרת/מעדכנת branch בשם `gh-pages`
- דוחפת את הקבצים ל-branch

### שלב 2: הגדר GitHub Pages (פעם אחת בלבד)
1. עבור ל-repository שלך ב-GitHub
2. לחץ על **Settings** > **Pages**
3. תחת **Source**, בחר **Deploy from a branch**
4. תחת **Branch**, בחר `gh-pages` ו-`/ (root)`
5. לחץ **Save**

---

## בדיקה לפני פריסה

// turbo
### 1. בדוק שאין שגיאות TypeScript
```
npx tsc --noEmit
```

// turbo
### 2. בדוק lint
```
npm run lint
```

### 3. בדוק שהאפליקציה עובדת מקומית
```
npm run web
```

---

## פתרון בעיות נפוצות

### הדף מציג 404
- וודא שה-`homepage` ב-`package.json` נכון
- וודא שהגדרת את GitHub Pages לתיקייה הנכונה (`docs` או `gh-pages`)
- המתן 2-5 דקות אחרי הפריסה

### שגיאות בזמן build
- וודא שכל ה-dependencies מותקנים: `npm install`
- נקה את ה-cache: `rm -rf .expo` (או `rmdir /s .expo` ב-Windows)
- נסה שוב: `npm run build:docs`

### משתני סביבה לא עובדים
- וודא שהקובץ `.env` קיים
- עבור production, הוסף את המשתנים ב-GitHub Secrets
- משתני סביבה צריכים להתחיל ב-`EXPO_PUBLIC_` כדי להיות זמינים ב-client

### API calls נכשלים
- GitHub Pages הוא static hosting - לא תומך ב-server-side code
- API routes לא יעבדו - צריך לקרוא ישירות ל-APIs חיצוניים
- וודא שה-API keys מוגדרים כ-`EXPO_PUBLIC_*` ב-`.env`

---

## עדכון האתר

כדי לעדכן את האתר אחרי שינויים:

1. עשה commit לכל השינויים שלך
2. הרץ את פקודת הפריסה המתאימה:
   - `npm run deploy:docs` (אם משתמש בתיקיית docs)
   - `npm run deploy:gh` (אם משתמש ב-gh-pages branch)
3. המתן 2-5 דקות לעדכון

---

## הערות חשובות

- **Static Hosting**: GitHub Pages הוא static hosting בלבד
- **No Server Routes**: API routes (בתיקיית `server/`) לא יעבדו
- **Direct API Calls**: צריך לקרוא ישירות ל-Hugging Face, Gemini וכו'
- **Environment Variables**: השתמש ב-`EXPO_PUBLIC_*` prefix
- **Build Time**: הבנייה יכולה לקחת 1-3 דקות
- **Deploy Time**: הפריסה ב-GitHub יכולה לקחת 2-5 דקות נוספות
