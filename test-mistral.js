const fetch = require('node-fetch');

async function testSingleQuestion() {
  const chunk = `פרשת עקידת יצחק (בראשית כב) היא פרק מכונן בתולדות עם ישראל. 
הפרק מתאר את ניסיון אברהם שנצטווה להקריב את בנו יחידו יצחק. 
מטרת הניסיון היא הוצאת הכוח הפוטנציאלי אל הפועל לפי הרמב"ן.
העקידה מהווה יסוד לזכות האבות וסמל לעמידה בניסיון.`;

  const prompt = `קרא את הקטע הבא ויצור שאלת רב-ברירה אחת בעברית.

קטע:
${chunk}

החזר JSON בלבד:
{"question":"שאלה","options":["תשובה נכונה","טעות א","טעות ב","טעות ג"],"correctAnswer":0,"explanation":"הסבר"}

חוקים:
- options[0] תמיד התשובה הנכונה
- כתוב תשובות שגויות הגיוניות על סמך הטקסט
- אל תשתמש במרכאות כפולות בתוך הטקסטים`;

  console.log('Sending single-question request...');
  const start = Date.now();

  const res = await fetch('https://unitedhatzalah.onrender.com/api/ai-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: prompt,
      systemPrompt: 'אתה מורה שיוצר שאלות לימוד בעברית. החזר JSON בלבד, ללא הסברים נוספים.',
      history: []
    }),
  });

  const elapsed = Date.now() - start;
  const data = await res.json();
  
  console.log(`Status: ${res.status} (${elapsed}ms)`);
  console.log('Raw answer:', data.answer);
  
  // Try to parse JSON
  const jsonMatch = data.answer?.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('\n✅ Parsed successfully:');
      console.log('  Question:', parsed.question);
      console.log('  Options:', parsed.options);
      console.log('  Correct:', parsed.options?.[parsed.correctAnswer]);
      console.log('  Explanation:', parsed.explanation);
    } catch(e) {
      console.log('❌ Parse failed:', e.message);
    }
  }
}

testSingleQuestion();
