import {
  AIProcessingRequest,
  AIProcessingResponse,
  GeneratedExercise,
  ExerciseType,
  DifficultyLevel,
  QuestionFeedback,
} from '@/types/ai-learning';

/**
 * Service for integrating with AI APIs to generate exercises from uploaded content
 * Supports multiple AI providers: OpenAI, Anthropic Claude, Google Gemini, Groq, or local solution
 */

interface AIConfig {
  provider: 'openai' | 'claude' | 'gemini' | 'groq' | 'brightdata' | 'local';
  apiKey?: string;
  apiEndpoint?: string;
  model?: string;
  zone?: string; // Bright Data Zone name (default: unblocker)
  // Fallback configuration
  fallbackOpenAIKey?: string;
  fallbackOpenAIModel?: string;
}

class AIContentProcessor {
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
  }

  /**
   * Generate title and subject automatically from content using AI
   */
  async generateTitleAndSubject(content: string): Promise<{ title: string; subject: string }> {
    const truncatedContent = content.slice(0, 3000); // Use first 3000 chars for analysis
    
    const prompt = `נתח את הטקסט הבא וצור כותרת קצרה ומתאימה ותחום ידע.

טקסט:
${truncatedContent}

החזר JSON בפורמט הבא בלבד:
\`\`\`json
{
  "title": "כותרת קצרה ומתאימה (עד 5 מילים)",
  "subject": "תחום הידע המתאים ביותר מהרשימה: מתמטיקה, פיזיקה, כימיה, ביולוגיה, ספרות, היסטוריה, גיאוגרפיה, תכנות, אנגלית, מדעי המחשב, כלכלה, פסיכולוגיה, רפואה, משפטים, אומנות, ספורט, אחר"
}
\`\`\``;

    try {
      // Try with AI if available
      if (this.config.provider !== 'local' && this.config.apiKey) {
        const result = await this.callAIForTitleSubject(prompt);
        if (result) return result;
      }
    } catch (error) {
      console.error('Error generating title/subject with AI:', error);
    }

    // Fallback: extract from content locally
    return this.extractTitleAndSubjectLocally(content);
  }

  private async callAIForTitleSubject(prompt: string): Promise<{ title: string; subject: string } | null> {
    try {
      let response: Response | null = null;
      let data: any = null;

      if (this.config.provider === 'groq' && this.config.apiKey) {
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model || 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 200,
          }),
        });
      } else if (this.config.provider === 'gemini' && this.config.apiKey) {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.config.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
          }),
        });
      }

      if (response && response.ok) {
        data = await response.json();
        let text = '';
        
        if (this.config.provider === 'groq') {
          text = data.choices?.[0]?.message?.content || '';
        } else if (this.config.provider === 'gemini') {
          text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.title && parsed.subject) {
            return { title: parsed.title, subject: parsed.subject };
          }
        }
      }
    } catch (error) {
      console.error('AI title/subject generation failed:', error);
    }
    return null;
  }

  private extractTitleAndSubjectLocally(content: string): { title: string; subject: string } {
    // Extract first meaningful sentence as title
    const sentences = content.split(/[.!?\n]/).filter(s => s.trim().length > 5);
    let title = sentences[0]?.trim().slice(0, 50) || 'חומר לימוד חדש';
    if (title.length > 40) title = title.slice(0, 40) + '...';

    // Detect subject from keywords
    const subjectKeywords: { [key: string]: string[] } = {
      'מתמטיקה': ['משוואה', 'חישוב', 'מספר', 'גיאומטריה', 'אלגברה', 'פונקציה'],
      'פיזיקה': ['כוח', 'מהירות', 'אנרגיה', 'תאוצה', 'חשמל', 'מגנט'],
      'כימיה': ['מולקולה', 'אטום', 'תגובה', 'חומצה', 'בסיס', 'יסוד'],
      'ביולוגיה': ['תא', 'גוף', 'DNA', 'חיידק', 'צמח', 'בעל חיים'],
      'היסטוריה': ['מלחמה', 'תקופה', 'מלך', 'מדינה', 'שנה', 'עם'],
      'רפואה': ['מחלה', 'טיפול', 'תרופה', 'רופא', 'חולה', 'בריאות', 'אבחון'],
      'תכנות': ['קוד', 'פונקציה', 'משתנה', 'לולאה', 'תוכנה', 'אלגוריתם'],
    };

    const lowerContent = content.toLowerCase();
    let detectedSubject = 'אחר';
    let maxMatches = 0;

    for (const [subject, keywords] of Object.entries(subjectKeywords)) {
      const matches = keywords.filter(kw => lowerContent.includes(kw)).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedSubject = subject;
      }
    }

    return { title, subject: detectedSubject };
  }

  /**
   * Main method to process uploaded content and generate exercises
   */
  async processContent(
    request: AIProcessingRequest,
    goodExamples?: QuestionFeedback[],
    badExamples?: QuestionFeedback[]
  ): Promise<AIProcessingResponse> {
    const startTime = Date.now();

    try {
      // Extract and clean content
      const cleanedContent = this.cleanContent(request.content);

      // Analyze content structure
      const contentAnalysis = await this.analyzeContent(
        cleanedContent,
        request.subject
      );

      // Generate exercises based on analysis, using good examples if available
      const exercises = await this.generateExercises(
        cleanedContent,
        contentAnalysis,
        request,
        goodExamples,
        badExamples
      );

      // Calculate learning time estimate (rough estimate: 2-3 minutes per exercise)
      const estimatedLearningTime = exercises.length * 2.5;

      return {
        contentId: request.contentId,
        exercises,
        summary: contentAnalysis.summary,
        keyTopics: contentAnalysis.topics,
        estimatedLearningTime: Math.round(estimatedLearningTime),
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Error processing content with AI:', error);
      throw new Error(
        `Failed to process content: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Clean and preprocess the content
   */
  private cleanContent(content: string): string {
    // Remove extra whitespace
    let cleaned = content.replace(/\s+/g, ' ').trim();

    // Remove special characters but keep Hebrew, English, numbers and important punctuation
    // Keep: Hebrew letters (א-ת), English letters (a-zA-Z), numbers, whitespace, and basic punctuation
    cleaned = cleaned.replace(/[^\u0590-\u05FFa-zA-Z0-9\s.,!?;:\-()[\]{}'"]/g, '');

    return cleaned;
  }

  /**
   * Analyze content to extract structure and key topics
   */
  private async analyzeContent(
    content: string,
    subject: string
  ): Promise<{
    summary: string;
    topics: string[];
    structure: string[];
  }> {
    // This would call the AI API to analyze content
    // For now, returning a simple analysis structure

    const contentLength = content.length;
    const sentenceCount = (content.match(/[.!?]+/g) || []).length;
    const words = content.split(/\s+/);
    const wordCount = words.length;

    return {
      summary: `Analyzed ${wordCount} words across ${sentenceCount} sentences in the subject: ${subject}`,
      topics: this.extractKeyTopics(content, subject),
      structure: this.identifyContentStructure(content),
    };
  }

  /**
   * Extract key topics from content - IMPROVED
   */
  private extractKeyTopics(content: string, subject: string): string[] {
    // Filter common Hebrew words that aren't meaningful topics
    const commonWords = [
      'את', 'של', 'על', 'עם', 'לא', 'גם', 'או', 'כי', 'אם', 'הוא', 'היא', 'הם', 'הן',
      'זה', 'זו', 'אלה', 'כל', 'רק', 'עוד', 'מה', 'מי', 'איך', 'למה', 'כמה', 'אבל',
      'אך', 'לכן', 'משום', 'היה', 'היו', 'יהיה', 'להיות', 'אותו', 'אותה', 'אלו',
      'כאשר', 'בין', 'תוך', 'אחרי', 'לפני', 'כמו', 'יותר', 'פחות', 'כדי', 'באופן',
      'לפי', 'בכל', 'עצמו', 'עצמה', 'שלו', 'שלה', 'שלהם', 'מכל', 'אצל', 'נגד',
      'בלי', 'עד', 'מתוך', 'לגבי', 'במקום', 'בזמן', 'הזה', 'הזו', 'הזאת', 'ההוא',
      'שהוא', 'שהיא', 'שהם', 'שהן', 'כבר', 'עדיין', 'כלל', 'בכלל', 'ממש', 'מאוד',
      'הרבה', 'קצת', 'בערך', 'אולי', 'כנראה', 'בטח', 'ודאי', 'מעט', 'מספיק',
      'להם', 'להן', 'לנו', 'לכם', 'אליו', 'אליה', 'אליהם', 'אלינו', 'ממנו', 'ממנה',
      'איזה', 'איזו', 'אילו', 'שום', 'משהו', 'מישהו', 'כלום', 'אף', 'כזה', 'כזו',
      'such', 'that', 'this', 'with', 'from', 'have', 'been', 'were', 'will', 'would',
      'could', 'should', 'there', 'their', 'about', 'which', 'when', 'where', 'what',
    ];

    const words = content
      .split(/\s+/)
      .map(w => w.replace(/[.,;:!?()"\[\]{}]/g, '')) // Remove punctuation
      .filter((w) => w.length > 3 && !commonWords.includes(w.toLowerCase()));

    const frequency: { [key: string]: number } = {};

    words.forEach((word) => {
      // Normalize word but keep original case for display
      const normalized = word.toLowerCase();
      if (!frequency[normalized]) {
        frequency[normalized] = 0;
      }
      frequency[normalized]++;
    });

    // Get top words by frequency, prefer longer words
    return Object.entries(frequency)
      .filter(([word, count]) => count >= 2 || word.length > 5) // Must appear twice or be longer
      .sort(([wordA, countA], [wordB, countB]) => {
        // Sort by count, then by word length
        if (countB !== countA) return countB - countA;
        return wordB.length - wordA.length;
      })
      .slice(0, 15)
      .map(([word]) => word);
  }

  /**
   * Identify content structure (headers, sections, etc.)
   */
  private identifyContentStructure(content: string): string[] {
    const sections: string[] = [];

    // Split by common delimiters
    const parts = content.split(/\n\n+|\.\s+[A-Z]|:\s+/);

    parts.forEach((part) => {
      const trimmed = part.trim();
      if (trimmed.length > 10 && trimmed.length < 200) {
        sections.push(trimmed);
      }
    });

    return sections.slice(0, 5); // Return first 5 sections
  }

  /**
   * Generate exercises based on content analysis and request parameters
   */
  private async generateExercises(
    content: string,
    analysis: any,
    request: AIProcessingRequest,
    goodExamples?: QuestionFeedback[],
    badExamples?: QuestionFeedback[]
  ): Promise<GeneratedExercise[]> {
    // Use real AI API if configured
    if (this.config.provider !== 'local' && this.config.apiKey) {
      return await this.generateExercisesWithAI(content, analysis, request, goodExamples, badExamples);
    }

    // Fallback to local generation
    return this.generateLocalExercises(content, analysis, request);
  }

  /**
   * Generate exercises using real AI API (Gemini, OpenAI, etc.) with fallback
   */
  private async generateExercisesWithAI(
    content: string,
    analysis: any,
    request: AIProcessingRequest,
    goodExamples?: QuestionFeedback[],
    badExamples?: QuestionFeedback[]
  ): Promise<GeneratedExercise[]> {
    // Build examples section if we have good feedback
    let examplesSection = '';
    if (goodExamples && goodExamples.length > 0) {
      const examples = goodExamples
        .slice(0, 3)
        .map((ex) => `- "${ex.questionText}"`)
        .join('\n');
      examplesSection = `

דוגמאות לשאלות טובות שקיבלו משוב חיובי מהמשתמשים:
${examples}

נסה ליצור שאלות באיכות דומה.`;
    }

    // Build bad examples section if we have bad feedback
    let badExamplesSection = '';
    let repetitiveQuestions: string[] = [];
    if (badExamples && badExamples.length > 0) {
      // Separate repetitive questions from other bad examples
      const repetitive = badExamples.filter(ex => ex.reason === 'repetitive');
      const otherBad = badExamples.filter(ex => ex.reason !== 'repetitive');
      
      repetitiveQuestions = repetitive.map(ex => ex.questionText);
      
      if (otherBad.length > 0) {
        const badExamplesList = otherBad
          .slice(0, 3)
          .map((ex) => {
            const reasonText = ex.reason === 'unclear' ? 'לא ברורה' :
                              ex.reason === 'too-easy' ? 'קלה מדי' :
                              ex.reason === 'too-hard' ? 'קשה מדי' :
                              ex.reason === 'wrong-answer' ? 'תשובה שגויה' :
                              ex.reason === 'not-relevant' ? 'לא רלוונטית' : 'בעייתית';
            return `- "${ex.questionText}" (${reasonText})`;
          })
          .join('\n');
        badExamplesSection = `

דוגמאות לשאלות בעייתיות שקיבלו משוב שלילי:
${badExamplesList}

הימנע מיצירת שאלות דומות או עם אותן בעיות.`;
      }
      
      if (repetitiveQuestions.length > 0) {
        badExamplesSection += `

⚠️ שאלות שדווחו כחזרתיות (אסור לשאול שאלות דומות או על אותו נושא):
${repetitiveQuestions.slice(0, 5).map((q, i) => `${i + 1}. "${q}"`).join('\n')}`;
      }
    }

    // Generate random seed for variety
    const randomSeed = Math.floor(Math.random() * 10000);
    const sessionId = Date.now();

    // Log content size for debugging
    console.log(`[AI] Content size: ${content.length} characters, Subject: ${request.subject}`);
    console.log(`[AI] Generating ${request.numberOfExercises} exercises from content`);
    if (repetitiveQuestions.length > 0) {
      console.log(`[AI] Avoiding ${repetitiveQuestions.length} repetitive question patterns`);
    }

    // Build previous questions section to prevent repetition
    let previousQuestionsSection = '';
    if (request.previousQuestions && request.previousQuestions.length > 0) {
      const prevQuestions = request.previousQuestions
        .slice(0, 20) // Limit to last 20 questions to save tokens
        .map((q, i) => `${i + 1}. "${q}"`)
        .join('\n');
      
      const forceNew = (request as any).forceNewQuestions;
      previousQuestionsSection = `

⚠️ **${forceNew ? '🚫 שאלות שגויות/קודמות - חובה להימנע לחלוטין!' : 'שאלות שכבר נשאלו (אסור לחזור עליהן או לשאול שאלות דומות):'}**
${prevQuestions}

${forceNew ? `
🔴 חובה מוחלטת: 
- אל תשתמש באותן מילים או ניסוחים דומים
- אל תשאל על אותם נושאים/מושגים
- צור שאלות מזווית אחרת לגמרי
- התמקד בפרטים אחרים מהטקסט
- אם השאלות הקודמות היו על הגדרות - שאל על דוגמאות
- אם היו על תאריכים - שאל על סיבות ותוצאות
` : 'חובה: צור שאלות חדשות לחלוטין שלא מופיעות ברשימה הזו ולא דומות להן.'}`;
    }

    const prompt = `אתה מורה מומחה שיוצר תרגילים מחומר לימוד.

חומר הלימוד (קרא את כל הטקסט מתחילתו ועד סופו!):
${content}

נושא: ${request.subject}
רמת קושי מועדפת: ${request.targetDifficulty}
מספר תרגילים: ${request.numberOfExercises}
${examplesSection}
${badExamplesSection}
${previousQuestionsSection}

מזהה סשן: ${sessionId}-${randomSeed}

הנחיות קריטיות ליצירת התרגילים:
1. **כיסוי מלא של כל החומר**: עליך לסרוק וללמוד את *כל* הטקסט שסופק, מתחילתו ועד סופו. חלק את החומר לחלקים (התחלה, אמצע, סוף) וצור שאלה אחת לפחות מכל חלק. אל תתמקד רק בהתחלה!
2. **מניעת חזרות מוחלטת**: וודא שכל שאלה בודקת פרט מידע שונה לחלוטין. אל תשאל פעמיים על אותו נושא, אותו מושג, או אותו פרט.
3. **גיוון מקסימלי**: השתמש בסוגי שאלות שונים (רב-ברירה, נכון/לא נכון, השלמת משפט) ובזוויות שונות (הגדרות, דוגמאות, סיבות, תוצאות, השוואות).
4. **התייחסות לכל חלקי הטקסט**: אם יש פסקאות או נושאים שונים בטקסט - צור שאלות על כל אחד מהם.

צור ${request.numberOfExercises} תרגילים איכותיים ומקוריים בעברית על סמך החומר המלא.
כל תרגיל חייב להיות מבוסס ישירות על התוכן.
חשוב: אל תחשוף את התשובה בתוך השאלה עצמה.
השתמש בניסוחים שונים, זוויות שונות והיבטים שונים של החומר.
הסברים חייבים להיות מפורטים, ברורים, ולהפנות ישירות לפסוקים או חלקים מהתוכן שמבססים את התשובה הנכונה.

החזר JSON בפורמט הבא בלבד, ללא טקסט נוסף:

\`\`\`json
{
  "exercises": [
    {
      "type": "multiple-choice",
      "question": "שאלה בעברית על התוכן",
      "options": ["תשובה 1", "תשובה 2", "תשובה 3", "תשובה 4"],
      "correctAnswer": 0,
      "explanation": "הסבר מפורט וברור בעברית עם הפניה ישירה לפסוק או חלק מהתוכן שמבסס את התשובה",
      "difficulty": "medium",
      "topic": "נושא מהתוכן",
      "keywords": ["מילת מפתח 1", "מילת מפתח 2"]
    },
    {
      "type": "true-false",
      "question": "נכון או לא נכון: משפט לבדיקה",
      "options": ["נכון", "לא נכון"],
      "correctAnswer": 0,
      "explanation": "הסבר למה המשפט נכון או לא נכון",
      "difficulty": "easy",
      "topic": "נושא מהתוכן",
      "keywords": ["מילת מפתח"]
    }
  ]
}
\`\`\`

חשוב מאוד עבור שאלות true-false:
- correctAnswer חייב להיות 0 (עבור "נכון") או 1 (עבור "לא נכון")
- options חייב להיות ["נכון", "לא נכון"]

סוגי תרגילים אפשריים: multiple-choice, true-false, fill-blank
רמות קושי: easy, medium, hard`;

    // Try Groq first (if configured as primary) - it's free and fast!
    if (this.config.provider === 'groq' && this.config.apiKey) {
      console.log('🟢 Attempting Groq API...');
      const groqResult = await this.callGroqAPI(prompt, request.contentId, analysis);
      if (groqResult) {
        console.log('✅ Groq API succeeded');
        return groqResult;
      }
      console.log('❌ Groq API failed');
    }

    // Try Gemini (if configured as primary)
    if (this.config.provider === 'gemini' && this.config.apiKey) {
      console.log('🔵 Attempting Gemini API...');
      const geminiResult = await this.callGeminiAPI(prompt, request.contentId, analysis);
      if (geminiResult) {
        console.log('✅ Gemini API succeeded');
        return geminiResult;
      }
      console.log('❌ Gemini API failed');
    }

    // Try OpenAI as fallback (or primary if configured)
    const openaiKey = this.config.provider === 'openai' ? this.config.apiKey : this.config.fallbackOpenAIKey;
    const openaiModel = this.config.provider === 'openai' ? this.config.model : this.config.fallbackOpenAIModel;

    if (openaiKey) {
      console.log('🟡 Attempting OpenAI API...');
      const openaiResult = await this.callOpenAIAPI(prompt, request.contentId, analysis, openaiKey, openaiModel);
      if (openaiResult) {
        console.log('✅ OpenAI API succeeded');
        return openaiResult;
      }
      console.log('❌ OpenAI API failed');
    }

    // Fallback to local generation
    console.log('🟠 Falling back to local generation...');
    return this.generateLocalExercises(content, analysis, request);
  }

  /**
   * Call Bright Data API (as Proxy to Groq/LLM)
   * Uses https://api.brightdata.com/request structure
   */
  private async callBrightDataAPI(
    prompt: string,
    contentId: string,
    analysis: any
  ): Promise<GeneratedExercise[] | null> {
    try {
      const brightDataToken = this.config.apiKey;
      // We need a target LLM. Since user wanted to replace Groq, we'll try to reach Groq THROUGH Bright Data.
      // We need the Groq Key for the inner request. We'll try to find it in process.env or fallback.
      // Note: In a real scenario, we might want to pass the Groq Key explicitly or use a different open model.
      const groqKey = (process.env as any).EXPO_PUBLIC_GROQ_API_KEY ||
        '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'; // Fallback to provided key

      const targetUrl = 'https://api.groq.com/openai/v1/chat/completions';
      const model = this.config.model || 'llama-3.3-70b-versatile';

      console.log(`[BrightData] Proxying request to ${targetUrl} via unblocker...`);

      // Construct the inner body for the LLM
      const innerBody = {
        model: model,
        messages: [
          {
            role: 'system',
            content: 'אתה עוזר ליצירת תרגילים חינוכיים בעברית. תמיד החזר JSON תקין בלבד, ללא טקסט נוסף.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      };

      // Construct the outer body for Bright Data
      const brightDataBody = {
        zone: this.config.zone || 'unblocker',
        url: targetUrl,
        format: 'json', // Changed from 'raw' to 'json' to let Bright Data parse response
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json', // Explicitly ask for JSON
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify(innerBody)
      };

      console.log('Sending request to Bright Data with token starting with:', brightDataToken ? brightDataToken.substring(0, 4) + '...' : 'MISSING');
      console.log('Targeting Zone:', this.config.zone || 'unblocker');

      const response = await fetch('https://api.brightdata.com/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${brightDataToken}`,
        },
        body: JSON.stringify(brightDataBody),
      });

      console.log('Bright Data Proxy response status:', response.status);

      const rawResponseText = await response.text();
      console.log('Bright Data raw response (first 500 chars):', rawResponseText.slice(0, 500));

      if (!response.ok) {
        console.error('Bright Data Proxy error (status not ok):', rawResponseText);
        return null;
      }

      if (!rawResponseText || rawResponseText.trim().length === 0) {
        console.error('Bright Data Proxy returned empty response');
        return null;
      }

      // The response body should be the raw response from Groq
      let data;
      try {
        data = JSON.parse(rawResponseText);
      } catch (e) {
        console.error('Failed to parse JSON from Bright Data proxy response:', e);
        return null;
      }

      // Validate if we got a valid LLM response
      if (data.error) {
        console.error('Target API Error via Proxy:', data.error);
        return null;
      }

      const responseText = data.choices?.[0]?.message?.content || '';
      console.log('Bright Data (Groq) response length:', responseText.length);
      return this.parseExercisesFromResponse(responseText, contentId, analysis);

    } catch (error) {
      console.error('Bright Data API error:', error);
      return null;
    }
  }

  /**
   * Call Groq API - Free and fast AI!
   */
  private async callGroqAPI(
    prompt: string,
    contentId: string,
    analysis: any,
    apiKeyOverride?: string
  ): Promise<GeneratedExercise[] | null> {
    try {
      const model = this.config.model || 'llama-3.3-70b-versatile';
      const apiKey = apiKeyOverride || this.config.apiKey;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: 'אתה עוזר ליצירת תרגילים חינוכיים בעברית. תמיד החזר JSON תקין בלבד, ללא טקסט נוסף לפני או אחרי.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.8,
          max_tokens: 4096,
        }),
      });

      const data = await response.json();
      console.log('Groq API response status:', response.status);

      if (!response.ok) {
        const errorMessage = data?.error?.message || 'Unknown Groq API error';
        console.error('Groq API error:', errorMessage);
        return null;
      }

      const responseText = data.choices?.[0]?.message?.content || '';
      console.log('Groq response length:', responseText.length);
      return this.parseExercisesFromResponse(responseText, contentId, analysis);

    } catch (error) {
      console.error('Groq API error:', error);
      return null;
    }
  }

  /**
   * Call Gemini API with retry logic
   */
  private async callGeminiAPI(
    prompt: string,
    contentId: string,
    analysis: any
  ): Promise<GeneratedExercise[] | null> {
    const modelName = this.config.model || 'gemini-2.5-flash';
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.config.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.95,
                maxOutputTokens: 2048,
                topP: 0.95,
                topK: 40,
              },
            }),
          }
        );

        const data = await response.json();
        console.log('Gemini API response status:', response.status);

        if (response.status === 503) {
          console.log(`Gemini API overloaded, attempt ${attempt}/${maxRetries}`);
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`Waiting ${waitTime / 1000}s before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
          return null; // Return null to trigger fallback
        }

        if (!response.ok) {
          const errorMessage = data?.error?.message || 'Unknown Gemini API error';
          console.error('Gemini API error:', errorMessage);
          return null;
        }

        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return this.parseExercisesFromResponse(responseText, contentId, analysis);

      } catch (fetchError) {
        console.error(`Gemini attempt ${attempt} error:`, fetchError);
        if (attempt === maxRetries) {
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Call DeepSeek API
   */
  private async callDeepSeekAPI(
    prompt: string,
    contentId: string,
    analysis: any
  ): Promise<GeneratedExercise[] | null> {
    const modelName = this.config.model || 'deepseek-chat';
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.8,
            max_tokens: 4096,
          }),
        });

        const data = await response.json();
        console.log('DeepSeek API response status:', response.status);

        if (!response.ok) {
          const errorMessage = data?.error?.message || 'Unknown DeepSeek API error';
          console.error('DeepSeek API error:', errorMessage);
          return null;
        }

        const responseText = data.choices?.[0]?.message?.content || '';
        console.log('DeepSeek response length:', responseText.length);
        return this.parseExercisesFromResponse(responseText, contentId, analysis);

      } catch (fetchError) {
        console.error(`DeepSeek attempt ${attempt} error:`, fetchError);
        if (attempt === maxRetries) {
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAIAPI(
    prompt: string,
    contentId: string,
    analysis: any,
    apiKey: string,
    model?: string
  ): Promise<GeneratedExercise[] | null> {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
      });

      const data = await response.json();
      console.log('OpenAI API response status:', response.status);

      if (!response.ok) {
        const errorMessage = data?.error?.message || 'Unknown OpenAI API error';
        console.error('OpenAI API error:', errorMessage);
        return null;
      }

      const responseText = data.choices?.[0]?.message?.content || '';
      return this.parseExercisesFromResponse(responseText, contentId, analysis);

    } catch (error) {
      console.error('OpenAI API error:', error);
      return null;
    }
  }

  /**
   * Parse exercises from AI response
   */
  private parseExercisesFromResponse(
    responseText: string,
    contentId: string,
    analysis: any
  ): GeneratedExercise[] | null {
    try {
      // Try to extract JSON from code blocks first
      const codeBlockMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        console.log('Found JSON code block');
        let jsonString = codeBlockMatch[1].trim();
        console.log('Extracted JSON length:', jsonString.length);
        console.log('First 200 chars:', jsonString.substring(0, 200));

        // Clean up common JSON issues and control characters
        jsonString = this.cleanJsonString(jsonString);
        console.log('Cleaned JSON length:', jsonString.length);
        console.log('Cleaned JSON first 300 chars:', jsonString.substring(0, 300));

        try {
          const parsed = JSON.parse(jsonString);
          if (parsed.exercises && Array.isArray(parsed.exercises)) {
            return this.processExercises(parsed.exercises, contentId, analysis);
          }
        } catch (cleanError) {
          console.error('Failed to parse cleaned JSON:', cleanError);
          // Try to extract exercises from malformed JSON
          const extractedExercises = this.extractExercisesFromMalformedJson(jsonString);
          if (extractedExercises && extractedExercises.length > 0) {
            console.log('Successfully extracted', extractedExercises.length, 'exercises from malformed JSON');
            return this.processExercises(extractedExercises, contentId, analysis);
          }
        }
      }

      // Fallback: Try to find JSON object containing "exercises"
      const jsonMatch = responseText.match(/\{[\s\S]*"exercises"[\s\S]*\}/);
      if (jsonMatch) {
        console.log('Parsed JSON match found');
        let jsonString = jsonMatch[0];

        // Clean up common issues and control characters
        jsonString = this.cleanJsonString(jsonString);

        const parsed = JSON.parse(jsonString);
        if (parsed.exercises && Array.isArray(parsed.exercises)) {
          return this.processExercises(parsed.exercises, contentId, analysis);
        }
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Try fallback parsing
      try {
        // Find the first { and last }
        const start = responseText.indexOf('{');
        const last = responseText.lastIndexOf('}');
        if (start !== -1 && last !== -1 && last > start) {
          const jsonString = responseText.substring(start, last + 1);
          const cleanedJson = this.cleanJsonString(jsonString);
          const parsed = JSON.parse(cleanedJson);
          if (parsed.exercises && Array.isArray(parsed.exercises)) {
            return this.processExercises(parsed.exercises, contentId, analysis);
          }
        }
      } catch (fallbackError) {
        console.error('Fallback parsing also failed:', fallbackError);
      }
    }
    return null;
  }

  /**
   * Clean JSON string by removing control characters and fixing common issues
   */
  private cleanJsonString(jsonString: string): string {
    // Remove control characters (except for \n, \r, \t which are allowed in JSON strings)
    jsonString = jsonString.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Remove trailing commas using a more robust lookahead which handles objects and arrays
    jsonString = jsonString.replace(/,(?=\s*[}\]])/g, '');

    // Add quotes to unquoted keys
    jsonString = jsonString.replace(/([{,]\s*)(\w+):/g, '$1"$2":');

    // Fix common escape issues
    jsonString = jsonString.replace(/\\n/g, '\\\\n'); // Escape literal \n
    jsonString = jsonString.replace(/\\t/g, '\\\\t'); // Escape literal \t
    jsonString = jsonString.replace(/\\r/g, '\\\\r'); // Escape literal \r

    // Remove any remaining problematic characters within strings
    jsonString = jsonString.replace(/"[^"]*[\x00-\x1F\x7F][^"]*"/g, (match) => {
      return match.replace(/[\x00-\x1F\x7F]/g, '');
    });

    // NOTE: The original logic for appending missing brackets/braces was removed.
    // It was too risky and could create invalid JSON, masking the real error.
    // It is better to let JSON.parse fail and rely on the fallback mechanisms.

    return jsonString;
  }

  /**
   * Try to extract exercises from malformed JSON by parsing individual exercise objects
   */
  private extractExercisesFromMalformedJson(jsonString: string): any[] | null {
    try {
      // Look for exercise objects using regex
      const exerciseRegex = /\{\s*"type"\s*:\s*"[^"]*"\s*,\s*"question"\s*:\s*"[^"]*"(?:\s*,\s*"[^"]*"\s*:\s*[^,}]*)*\}/g;
      const matches = jsonString.match(exerciseRegex);

      if (matches && matches.length > 0) {
        const exercises = [];
        for (const match of matches) {
          try {
            // Try to parse each individual exercise
            const exercise = JSON.parse(match);
            if (exercise.type && exercise.question) {
              exercises.push(exercise);
            }
          } catch (e) {
            // Skip malformed individual exercises
            console.log('Skipping malformed exercise:', match.substring(0, 100));
          }
        }

        if (exercises.length > 0) {
          return exercises;
        }
      }

      // Fallback: Try to find all question-answer pairs
      const questionRegex = /"question"\s*:\s*"([^"]*)"/g;
      const questions = [];
      let match;
      while ((match = questionRegex.exec(jsonString)) !== null) {
        questions.push(match[1]);
      }

      if (questions.length > 0) {
        // Create basic exercises from questions
        return questions.map((question, index) => ({
          type: 'multiple-choice',
          question: question,
          options: ['תשובה 1', 'תשובה 2', 'תשובה 3', 'תשובה 4'],
          correctAnswer: 0,
          explanation: 'תשובה שנוצרה אוטומטית',
          difficulty: 'medium'
        }));
      }

    } catch (error) {
      console.error('Failed to extract exercises from malformed JSON:', error);
    }

    return null;
  }

  private processExercises(
    exercises: any[],
    contentId: string,
    analysis: any
  ): GeneratedExercise[] {
    return exercises.map((ex: any, index: number) => ({
      id: `ex-ai-${index}-${Date.now()}`,
      contentId: contentId,
      type: ex.type || 'multiple-choice',
      question: ex.question,
      options: ex.options,
      correctAnswer: ex.correctAnswer,
      explanation: ex.explanation,
      difficulty: ex.difficulty || 'medium',
      topic: ex.topic || analysis.topics[0] || 'general',
      keywords: ex.keywords || [],
    })).filter(ex => ex.question && ex.explanation); // Filter out incomplete exercises
  }

  /**
   * Generate exercises locally (without AI API)
   */
  private async generateLocalExercises(
    content: string,
    analysis: any,
    request: AIProcessingRequest
  ): Promise<GeneratedExercise[]> {
    const exercises: GeneratedExercise[] = [];
    const exerciseTypesToUse = request.preferredExerciseTypes.length
      ? request.preferredExerciseTypes
      : this.getDefaultExerciseTypes();

    for (let i = 0; i < request.numberOfExercises; i++) {
      const difficulty = this.selectDifficulty(
        request.targetDifficulty,
        i,
        request.numberOfExercises
      );
      const exerciseType = exerciseTypesToUse[i % exerciseTypesToUse.length];

      const exercise = await this.createExercise(
        content,
        analysis,
        exerciseType,
        difficulty,
        request.subject,
        i
      );

      exercises.push(exercise);
    }

    return exercises;
  }

  /**
   * Create a single exercise
   */
  private async createExercise(
    content: string,
    analysis: any,
    type: ExerciseType,
    difficulty: DifficultyLevel,
    subject: string,
    index: number
  ): Promise<GeneratedExercise> {
    const contentSnippet = this.extractContentSnippet(content, index);
    const topic = analysis.topics[index % analysis.topics.length];

    switch (type) {
      case 'multiple-choice':
        return this.createMultipleChoice(
          contentSnippet,
          difficulty,
          subject,
          topic,
          index
        );

      case 'fill-blank':
        return this.createFillBlank(
          contentSnippet,
          difficulty,
          subject,
          topic,
          index
        );

      case 'matching':
        return this.createMatching(
          contentSnippet,
          difficulty,
          subject,
          topic,
          index
        );

      case 'true-false':
        return this.createTrueFalse(
          contentSnippet,
          difficulty,
          subject,
          topic,
          index
        );

      case 'short-answer':
        return this.createShortAnswer(
          contentSnippet,
          difficulty,
          subject,
          topic,
          index
        );

      case 'ordering':
        return this.createOrdering(
          contentSnippet,
          difficulty,
          subject,
          topic,
          index
        );

      default:
        return this.createMultipleChoice(
          contentSnippet,
          difficulty,
          subject,
          topic,
          index
        );
    }
  }

  /**
   * Extract a snippet of content for the exercise
   */
  private extractContentSnippet(content: string, index: number): string {
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim());
    const snippetStart = (index * 3) % sentences.length;
    return sentences
      .slice(snippetStart, snippetStart + 3)
      .join('. ')
      .trim();
  }

  /**
   * Create multiple choice exercise - IMPROVED with variety
   */
  private createMultipleChoice(
    content: string,
    difficulty: DifficultyLevel,
    subject: string,
    topic: string,
    index: number
  ): GeneratedExercise {
    const sentences = content.split(/[.!?]+/).filter((s) => s && s.trim().length > 20);

    // Question templates for variety
    const questionTemplates = [
      { template: 'definition', prefix: 'מהי ההגדרה הנכונה של' },
      { template: 'meaning', prefix: 'מה המשמעות של' },
      { template: 'purpose', prefix: 'מהי המטרה העיקרית של' },
      { template: 'characteristic', prefix: 'מה מאפיין את' },
      { template: 'difference', prefix: 'מה ההבדל בין' },
      { template: 'example', prefix: 'מהי דוגמה ל' },
      { template: 'result', prefix: 'מה התוצאה של' },
      { template: 'reason', prefix: 'מדוע' },
      { template: 'when', prefix: 'מתי משתמשים ב' },
      { template: 'who', prefix: 'מי אחראי על' },
      { template: 'where', prefix: 'היכן מתבצע' },
      { template: 'how', prefix: 'כיצד פועל' },
    ];

    const templateIndex = index % questionTemplates.length;
    const selectedTemplate = questionTemplates[templateIndex];

    if (sentences.length === 0) {
      const fallbackOptions = [topic, 'מושג אחר', 'רעיון שונה', 'תפיסה נוספת'];
      const shuffled = this.shuffleOptionsWithAnswer(fallbackOptions, 0);
      return {
        id: `ex-mc-${index}-${Date.now()}`,
        contentId: '',
        type: 'multiple-choice',
        question: `${selectedTemplate.prefix} "${topic}" בתחום ${subject}?`,
        options: shuffled.options,
        correctAnswer: shuffled.correctIndex,
        explanation: `התשובה הנכונה היא "${topic}".`,
        difficulty,
        topic,
        keywords: [topic],
      };
    }

    // Pick different sentence based on index
    const sentenceIndex = (index * 7) % sentences.length;
    const baseSentence = sentences[sentenceIndex].trim();

    // Extract meaningful words (filter short and common words)
    const commonWords = ['את', 'של', 'על', 'עם', 'לא', 'גם', 'או', 'כי', 'אם', 'הוא', 'היא', 'הם', 'הן', 'זה', 'זו', 'אלה', 'כל', 'רק', 'עוד', 'מה', 'מי', 'איך', 'למה', 'כמה', 'אבל', 'אך', 'לכן', 'משום', 'היה', 'היו', 'יהיה', 'להיות', 'אותו', 'אותה', 'אלו', 'כאשר', 'בין', 'תוך', 'אחרי', 'לפני', 'כמו', 'יותר', 'פחות'];
    const words = baseSentence.split(/\s+/).filter((w) => w && w.length > 3 && !commonWords.includes(w));

    // Create varied questions based on template
    let question = '';
    let correctOption = '';
    let distractors: string[] = [];

    if (words.length >= 3) {
      const keyWordIndex = Math.floor(Math.random() * Math.min(words.length, 5));
      correctOption = words[keyWordIndex];

      // Get other words as distractors
      distractors = words.filter((w, i) => i !== keyWordIndex && w !== correctOption).slice(0, 3);

      // Fill missing distractors with context-aware options
      const contextDistractors = [
        `${topic} אחר`,
        `לא ${correctOption}`,
        `הפך מ${correctOption}`,
        'אף אחת מהתשובות',
        'כל התשובות נכונות',
        `${subject} - מושג קשור`,
      ];
      while (distractors.length < 3) {
        distractors.push(contextDistractors[distractors.length % contextDistractors.length]);
      }

      // Create question based on template type
      switch (selectedTemplate.template) {
        case 'definition':
          question = `על פי החומר, מהי ההגדרה הנכונה הקשורה ל"${topic}"?`;
          break;
        case 'meaning':
          question = `מה המשמעות של הביטוי שמופיע בחומר בהקשר של "${topic}"?`;
          break;
        case 'purpose':
          question = `מהי המטרה העיקרית של "${correctOption}" כפי שמתואר בחומר?`;
          distractors = ['לשפר תהליכים', 'למנוע בעיות', 'ליצור הזדמנויות'];
          break;
        case 'characteristic':
          question = `איזה מאפיין מתאר את "${topic}" על פי החומר?`;
          break;
        case 'result':
          question = `מה קורה כתוצאה מ${baseSentence.slice(0, 40)}...?`;
          break;
        case 'reason':
          question = `מדוע ${baseSentence.slice(0, 50)}...?`;
          break;
        case 'when':
          question = `מתי מתרחש התהליך המתואר בחומר בהקשר של "${topic}"?`;
          distractors = ['בתחילת התהליך', 'בסוף התהליך', 'לפני ההכנה'];
          break;
        case 'how':
          question = `כיצד מתבצע ${baseSentence.slice(0, 40)}...?`;
          break;
        default:
          question = `על פי החומר בנושא "${topic}": ${baseSentence.slice(0, 60)}... מהי המילה הנכונה?`;
      }
    } else {
      correctOption = topic;
      distractors = ['אפשרות א', 'אפשרות ב', 'אפשרות ג'];
      question = `${selectedTemplate.prefix} "${topic}" על פי החומר?`;
    }

    const options = [correctOption, ...distractors.slice(0, 3)];
    const shuffled = this.shuffleOptionsWithAnswer(options, 0);

    return {
      id: `ex-mc-${index}-${Date.now()}`,
      contentId: '',
      type: 'multiple-choice',
      question,
      options: shuffled.options,
      correctAnswer: shuffled.correctIndex,
      explanation: `התשובה הנכונה היא "${correctOption}". מושג זה מופיע בחומר בהקשר של ${topic} ומתייחס ל${baseSentence ? baseSentence.slice(0, 60) + '...' : subject}.`,
      difficulty,
      topic,
      keywords: [topic, correctOption],
    };
  }

  /**
   * Shuffle options and return new correct answer index
   */
  private shuffleOptionsWithAnswer(options: string[], correctIndex: number): { options: string[], correctIndex: number } {
    const correctAnswer = options[correctIndex];

    // Fisher-Yates shuffle
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Find new position of correct answer
    const newCorrectIndex = shuffled.indexOf(correctAnswer);

    return {
      options: shuffled,
      correctIndex: newCorrectIndex
    };
  }

  /**
   * Create fill-in-the-blank exercise - IMPROVED with variety
   */
  private createFillBlank(
    content: string,
    difficulty: DifficultyLevel,
    subject: string,
    topic: string,
    index: number
  ): GeneratedExercise {
    const sentences = content.split(/[.!?]+/).filter((s) => s && s.trim().length > 20);

    // Different fill-blank templates
    const templates = [
      { type: 'complete', prefix: 'השלם את המשפט:' },
      { type: 'missing', prefix: 'מהי המילה החסרה:' },
      { type: 'define', prefix: 'השלם את ההגדרה:' },
      { type: 'connect', prefix: 'השלם את הקשר:' },
    ];

    const selectedTemplate = templates[index % templates.length];

    if (sentences.length === 0) {
      return {
        id: `ex-fb-${index}-${Date.now()}`,
        contentId: '',
        type: 'fill-blank',
        question: `${selectedTemplate.prefix} התוכן בנושא ${subject} עוסק ב_____`,
        correctAnswer: topic,
        explanation: `המילה החסרה היא "${topic}".`,
        difficulty,
        topic,
        keywords: [topic],
      };
    }

    // Use different sentences for variety
    const sentenceIndex = (index * 5 + 3) % sentences.length;
    const sentence = sentences[sentenceIndex].trim();

    // Filter common Hebrew words
    const commonWords = ['את', 'של', 'על', 'עם', 'לא', 'גם', 'או', 'כי', 'אם', 'הוא', 'היא', 'הם', 'הן', 'זה', 'זו', 'כל', 'רק', 'עוד', 'היה', 'היו', 'אלה', 'אלו', 'כאשר', 'בין', 'תוך', 'אחרי', 'לפני', 'כמו'];
    const words = sentence.split(/\s+/).filter(w => w && w.length > 3 && !commonWords.includes(w));

    if (words.length < 3) {
      return {
        id: `ex-fb-${index}-${Date.now()}`,
        contentId: '',
        type: 'fill-blank',
        question: `${selectedTemplate.prefix} ${sentence} מתייחס ל_____`,
        correctAnswer: topic,
        explanation: `המילה החסרה קשורה ל${topic}.`,
        difficulty,
        topic,
        keywords: [topic],
      };
    }

    // Pick meaningful word to blank out (not first or last)
    const blankIndex = 1 + Math.floor(Math.random() * (words.length - 2));
    const correctAnswer = words[blankIndex];

    // Create sentence with blank
    const sentenceWithBlank = sentence.replace(correctAnswer, '_____');

    // Create distractor options from other words in the content
    const distractorWords = words.filter((w, i) => i !== blankIndex && w !== correctAnswer).slice(0, 3);
    while (distractorWords.length < 3) {
      distractorWords.push(`מושג מ${topic}`);
    }
    const allOptions = [correctAnswer, ...distractorWords];
    // Shuffle options
    const shuffledOptions = allOptions.sort(() => Math.random() - 0.5);

    return {
      id: `ex-fb-${index}-${Date.now()}`,
      contentId: '',
      type: 'fill-blank',
      question: `${selectedTemplate.prefix} ${sentenceWithBlank}`,
      options: shuffledOptions, // Provide options as hints
      correctAnswer: correctAnswer, // Store the actual text, not the index
      explanation: `המילה החסרה היא "${correctAnswer}". המשפט המלא מופיע בחומר: "${sentence.slice(0, 70)}..."`,
      difficulty,
      topic,
      keywords: [topic, correctAnswer],
    };
  }

  /**
   * Create matching exercise - Duolingo-style tap the pairs
   */
  private createMatching(
    content: string,
    difficulty: DifficultyLevel,
    subject: string,
    topic: string,
    index: number
  ): GeneratedExercise {
    // Extract key terms and their definitions/translations from content
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 15);
    
    // Create 5 pairs for matching (like Duolingo)
    const numPairs = 5;
    const pairs: { left: string; right: string }[] = [];
    
    // Try to extract meaningful pairs from content
    for (let i = 0; i < Math.min(numPairs, sentences.length); i++) {
      const sentence = sentences[(index + i) % sentences.length].trim();
      const words = sentence.split(/\s+/).filter(w => w.length > 2);
      
      if (words.length >= 2) {
        // Use first meaningful word as left, and a related concept as right
        const leftWord = words[0].replace(/[^\u0590-\u05FFa-zA-Z0-9]/g, '');
        const rightWord = words[Math.min(1, words.length - 1)].replace(/[^\u0590-\u05FFa-zA-Z0-9]/g, '');
        if (leftWord && rightWord && leftWord !== rightWord) {
          pairs.push({ left: leftWord, right: rightWord });
        }
      }
    }
    
    // Fill remaining with topic-related placeholders if needed
    while (pairs.length < numPairs) {
      pairs.push({
        left: `מושג ${pairs.length + 1}`,
        right: `הגדרה ${pairs.length + 1}`
      });
    }
    
    // keywords = left items, options = right items (in same order - will be shuffled in UI)
    const keywords = pairs.map(p => p.left);
    const options = pairs.map(p => p.right);

    return {
      id: `ex-mt-${index}-${Date.now()}`,
      contentId: '',
      type: 'matching',
      question: 'התאם את הזוגות',
      options: options, // Right column items
      keywords: keywords, // Left column items
      correctAnswer: [0, 1, 2, 3, 4], // Index mapping (left[i] matches options[i])
      explanation: `התאמת מושגים מרכזיים מהחומר בנושא ${topic}.`,
      difficulty,
      topic,
    };
  }

  /**
   * Create true/false exercise - IMPROVED with variety and false statements
   */
  private createTrueFalse(
    content: string,
    difficulty: DifficultyLevel,
    subject: string,
    topic: string,
    index: number
  ): GeneratedExercise {
    const sentences = content.split(/[.!?]+/).filter((s) => s && s.trim().length > 20);

    // Alternate between true and false questions
    const shouldBeFalse = index % 2 === 1;

    // Templates for variety
    const trueTemplates = [
      'נכון או לא נכון:',
      'האם המשפט הבא נכון?',
      'קבע אם הטענה הבאה נכונה:',
      'בדוק את נכונות הטענה:',
    ];

    const template = trueTemplates[index % trueTemplates.length];

    if (sentences.length === 0) {
      return {
        id: `ex-tf-${index}-${Date.now()}`,
        contentId: '',
        type: 'true-false',
        question: `${template} התוכן עוסק בנושא ${topic} בתחום ${subject}`,
        options: ['נכון', 'לא נכון'],
        correctAnswer: 0, // 0 = נכון
        explanation: `המשפט נכון - התוכן אכן עוסק בנושא ${topic}.`,
        difficulty,
        topic,
        keywords: [topic],
      };
    }

    // Pick different sentence
    const sentenceIndex = (index * 3 + 2) % sentences.length;
    let statement = sentences[sentenceIndex].trim();

    if (shouldBeFalse) {
      // Create a false statement by modifying the original
      const modifications = [
        { find: /תמיד/g, replace: 'אף פעם לא' },
        { find: /חייב/g, replace: 'אסור' },
        { find: /ראשון/g, replace: 'אחרון' },
        { find: /לפני/g, replace: 'אחרי' },
        { find: /יותר/g, replace: 'פחות' },
        { find: /גדול/g, replace: 'קטן' },
        { find: /חשוב/g, replace: 'לא חשוב' },
        { find: /נכון/g, replace: 'שגוי' },
        { find: /מותר/g, replace: 'אסור' },
        { find: /כן/g, replace: 'לא' },
      ];

      let modified = false;
      for (const mod of modifications) {
        if (mod.find.test(statement)) {
          statement = statement.replace(mod.find, mod.replace);
          modified = true;
          break;
        }
      }

      // If no modification was made, add negation
      if (!modified) {
        if (statement.length > 30) {
          statement = statement.slice(0, 30) + ' - זו טעות נפוצה בנושא ' + topic;
        }
      }

      return {
        id: `ex-tf-${index}-${Date.now()}`,
        contentId: '',
        type: 'true-false',
        question: `${template} ${statement}`,
        options: ['נכון', 'לא נכון'],
        correctAnswer: 1, // 1 = לא נכון
        explanation: `המשפט אינו נכון - על פי החומר, המידע הנכון שונה ממה שנאמר בשאלה.`,
        difficulty,
        topic,
        keywords: [topic],
      };
    }

    return {
      id: `ex-tf-${index}-${Date.now()}`,
      contentId: '',
      type: 'true-false',
      question: `${template} ${statement}`,
      options: ['נכון', 'לא נכון'],
      correctAnswer: 0, // 0 = נכון
      explanation: `המשפט נכון - זה מופיע בחומר: "${statement.slice(0, 50)}..."`,
      difficulty,
      topic,
      keywords: [topic],
    };
  }

  /**
   * Create short answer exercise
   */
  private createShortAnswer(
    content: string,
    difficulty: DifficultyLevel,
    subject: string,
    topic: string,
    index: number
  ): GeneratedExercise {
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 20);
    const sentenceIndex = (index * 4) % sentences.length;
    const contextSentence = sentences[sentenceIndex].trim();

    return {
      id: `ex-sa-${index}-${Date.now()}`,
      contentId: '',
      type: 'short-answer',
      question: `הסבר את המשמעות של "${topic}" על פי החומר הבא: "${contextSentence.slice(0, 80)}..."`,
      correctAnswer: topic,
      explanation: `תשובה טובה צריכה להתייחס למושגים המרכזיים שמוזכרים בחומר ולהסביר את הקשר שלהם ל${topic}.`,
      difficulty,
      topic,
      keywords: [topic, subject],
    };
  }

  /**
   * Create ordering exercise
   */
  private createOrdering(
    content: string,
    difficulty: DifficultyLevel,
    subject: string,
    topic: string,
    index: number
  ): GeneratedExercise {
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 15);
    const options = sentences.slice(index, index + 4).map((s, i) => s.trim());

    return {
      id: `ex-or-${index}-${Date.now()}`,
      contentId: '',
      type: 'ordering',
      question: `סדר את המשפטים הבאים לפי סדר הופעתם בחומר:`,
      options: options.length >= 3 ? options.slice(0, 3) : [
        'משפט ראשון מהחומר',
        'משפט שני מהחומר',
        'משפט שלישי מהחומר',
      ],
      correctAnswer: ['0', '1', '2'],
      explanation: `הסדר הנכון עוקב אחר הרצף שבו המידע מופיע בחומר הלימוד. זה קשור למושג ${topic}.`,
      difficulty,
      topic,
      keywords: [topic],
    };
  }

  /**
   * Get default exercise types if none specified
   */
  private getDefaultExerciseTypes(): ExerciseType[] {
    return [
      'multiple-choice',
      'fill-blank',
      'true-false',
      'matching',
      'short-answer',
    ];
  }

  /**
   * Select appropriate difficulty based on position and request
   */
  private selectDifficulty(
    targetDifficulties: DifficultyLevel[],
    index: number,
    total: number
  ): DifficultyLevel {
    if (!targetDifficulties.length) {
      // Default progression: easy -> medium -> hard
      if (index < total * 0.33) return 'easy';
      if (index < total * 0.66) return 'medium';
      return 'hard';
    }

    return targetDifficulties[index % targetDifficulties.length];
  }

  /**
   * Check if a user's answer is semantically correct using AI
   * This allows for variations in phrasing, spelling, etc.
   */
  async checkAnswerWithAI(
    question: string,
    userAnswer: string,
    correctAnswer: string
  ): Promise<{ isCorrect: boolean; feedback?: string }> {
    // First, do basic normalization check
    const normalizedUser = this.normalizeAnswer(userAnswer);
    const normalizedCorrect = this.normalizeAnswer(correctAnswer);
    
    // If exact match after normalization, no need for AI
    if (normalizedUser === normalizedCorrect) {
      return { isCorrect: true };
    }

    // If answers are very similar (minor typo), accept
    if (this.calculateSimilarity(normalizedUser, normalizedCorrect) > 0.85) {
      return { isCorrect: true, feedback: 'תשובה נכונה (עם שגיאת כתיב קטנה)' };
    }

    // Use AI for semantic comparison
    try {
      if (this.config.provider !== 'local' && this.config.apiKey) {
        const result = await this.callAIForAnswerCheck(question, userAnswer, correctAnswer);
        if (result !== null) {
          return result;
        }
      }
    } catch (error) {
      console.error('AI answer check failed:', error);
    }

    // Fallback: check for partial match or synonyms
    return this.checkAnswerLocally(normalizedUser, normalizedCorrect);
  }

  private normalizeAnswer(answer: string): string {
    return answer
      .trim()
      .toLowerCase()
      // Remove punctuation
      .replace(/[.,!?;:'"()-]/g, '')
      // Normalize Hebrew final letters
      .replace(/ך/g, 'כ')
      .replace(/ם/g, 'מ')
      .replace(/ן/g, 'נ')
      .replace(/ף/g, 'פ')
      .replace(/ץ/g, 'צ')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    // Levenshtein distance based similarity
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[str1.length][str2.length];
    const maxLen = Math.max(str1.length, str2.length);
    return 1 - distance / maxLen;
  }

  private async callAIForAnswerCheck(
    question: string,
    userAnswer: string,
    correctAnswer: string
  ): Promise<{ isCorrect: boolean; feedback?: string } | null> {
    const prompt = `בדוק אם התשובה של המשתמש נכונה מבחינה סמנטית.

שאלה: ${question}
תשובה נכונה: ${correctAnswer}
תשובת המשתמש: ${userAnswer}

הוראות:
- תשובה נחשבת נכונה אם היא מביעה את אותו רעיון, גם אם בניסוח שונה
- התעלם משגיאות כתיב קטנות
- קבל תשובות מקוצרות אם הן מדויקות (למשל "log n" במקום "log(n)")
- קבל תשובות במילים אחרות אם המשמעות זהה

החזר JSON בפורמט:
\`\`\`json
{
  "isCorrect": true/false,
  "feedback": "הסבר קצר אם התשובה שגויה"
}
\`\`\``;

    try {
      let response: Response | null = null;

      if (this.config.provider === 'groq' && this.config.apiKey) {
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model || 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 150,
          }),
        });
      } else if (this.config.provider === 'gemini' && this.config.apiKey) {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.config.apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 150 },
          }),
        });
      } else if (this.config.provider === 'openai' && this.config.apiKey) {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            max_tokens: 150,
          }),
        });
      }

      if (response && response.ok) {
        const data = await response.json();
        let text = '';
        
        if (this.config.provider === 'groq' || this.config.provider === 'openai') {
          text = data.choices?.[0]?.message?.content || '';
        } else if (this.config.provider === 'gemini') {
          text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            isCorrect: Boolean(parsed.isCorrect),
            feedback: parsed.feedback,
          };
        }
      }
    } catch (error) {
      console.error('AI answer check API call failed:', error);
    }
    return null;
  }

  private checkAnswerLocally(
    normalizedUser: string,
    normalizedCorrect: string
  ): { isCorrect: boolean; feedback?: string } {
    // Check if user answer contains the correct answer or vice versa
    if (normalizedUser.includes(normalizedCorrect) || normalizedCorrect.includes(normalizedUser)) {
      if (normalizedUser.length >= normalizedCorrect.length * 0.7) {
        return { isCorrect: true, feedback: 'תשובה נכונה (חלקית)' };
      }
    }

    // Check for common mathematical equivalents
    const mathEquivalents: { [key: string]: string[] } = {
      'log n': ['logn', 'log(n)', 'o(log n)', 'o(logn)', 'h=logn', 'h=log(n)', 'h = log n', 'h = log(n)'],
      'n log n': ['nlogn', 'n*log(n)', 'n * log n', 'o(n log n)', 'o(nlogn)'],
      'n^2': ['n2', 'n**2', 'n בריבוע', 'n squared', 'o(n^2)', 'o(n2)'],
      '2^n': ['2n', '2**n', '2 בחזקת n', 'o(2^n)'],
      'n': ['o(n)', 'n', 'ליניארי'],
      '1': ['o(1)', 'קבוע', 'constant'],
    };

    for (const [key, equivalents] of Object.entries(mathEquivalents)) {
      const allForms = [key, ...equivalents].map(s => s.replace(/\s+/g, ''));
      const userNoSpace = normalizedUser.replace(/\s+/g, '');
      const correctNoSpace = normalizedCorrect.replace(/\s+/g, '');
      
      if (allForms.includes(userNoSpace) && allForms.includes(correctNoSpace)) {
        return { isCorrect: true };
      }
    }

    return { isCorrect: false };
  }
}

// Export singleton instance
let processorInstance: AIContentProcessor | null = null;

export function initializeAIProcessor(config: AIConfig): AIContentProcessor {
  // Log provider and whether apiKey is present (mask key for safety)
  try {
    const keyPresent = !!config.apiKey;
    let masked = '';
    if (config.apiKey) {
      masked = config.apiKey.replace(/.(?=.{4})/g, '*');
    }
    console.log(`[AI] initializeAIProcessor: provider=${config.provider} apiKey=${keyPresent ? masked : 'missing'}`);
  } catch (e) {
    console.log('[AI] initializeAIProcessor: provider=', config.provider);
  }

  processorInstance = new AIContentProcessor(config);
  return processorInstance;
}

export function getAIProcessor(): AIContentProcessor {
  if (!processorInstance) {
    throw new Error('AI Processor not initialized. Call initializeAIProcessor first.');
  }
  return processorInstance;
}

export { AIContentProcessor };
