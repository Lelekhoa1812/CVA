# CV Assistant - AI-Powered Resume & Cover Letter Platform

A web application for creating personalized cover letters and resumes, built with Next.js, TypeScript, Tailwind CSS, and NVIDIA NIM.

[CV Assistant Demo](https://cva-mauve.vercel.app/)

## 🚀 Overview

CV Assistant is a full-featured professional development platform that combines AI-powered content generation with intelligent resume building. The application offers two main services:

1. **AI-Powered Cover Letter Generation** - Creates personalized cover letters based on job descriptions and user profiles
2. **Intelligent Resume Builder** - Builds professional resumes with AI coaching for styling and content enhancement

## 📸 Screenshots

### 🏠 Dashboard
![Dashboard](./imgsrc/dashboard.png)
*Main dashboard showcasing both cover letter generation and resume customization features*

### 🔐 Authentication
![Credentials](./imgsrc/credential.png)
*Secure login and registration interface with modern design*

### 👤 Profile Management
![Upload Resume](./imgsrc/profile/upload-resume.png)
*Import profile details from text, DOCX, or PDF, including scanned pages.*

![Profile Management](./imgsrc/profile/profile.png)
*Comprehensive user profile management with experience, skills, and project management*

![Content Enhancement](./imgsrc/profile/enhance.png)
*AI-powered enhancement of project and experience descriptions using advanced LLM techniques*

### ✨ Cover Letter Generation
![Generate Cover Letter](./imgsrc/cv/generate.png)
*AI-powered cover letter generation interface with intelligent reasoning and skill matching*

### 📄 Resume Builder

#### Resume Creation Interface
![Resume Builder](./imgsrc/resume/view.png)
*Main resume builder interface with project/experience selection and AI enhancement options*

#### Styling Customization
![Style Coaching](./imgsrc/resume/style-coach.png)
*AI coaching for resume styling preferences including font size, bold/italic usage, and layout options*

#### Content Enhancement
![Content Selection](./imgsrc/resume/content-coach/select.png)
*Intelligent selection of up to 3 projects/experiences for targeted content enhancement*

![Content Editing](./imgsrc/resume/content-coach/edit.png)
*AI-powered content enhancement with personalized questions for each selected item*

![Content Editing](./imgsrc/resume/content-coach/done-item.png)
*Once finished with an item, please wait for the system ingest and process your data*

![Progressing State](./imgsrc/resume/on-hold.png)
*Once on coaching agent mode, you can't generate, press `Reset` to exit*

#### Choose Template
![Template Selector](./imgsrc/resume/preview.png)
*Select your preferred template from our existing library*

#### Generation Completion
![Resume Complete](./imgsrc/resume/done.png)
*Successfully generated resume with enhanced content and styling preferences applied*

#### Preview
Have a look at our resume samples:  
[Harvard Style](https://github.com/Lelekhoa1812/CVA/blob/main/cv-assistant/public/style1.pdf)  
[Chronological Style](https://github.com/Lelekhoa1812/CVA/blob/main/cv-assistant/public/style2.pdf)  
[Modernised Style](https://github.com/Lelekhoa1812/CVA/blob/main/cv-assistant/public/style3.pdf)  
[Creative Style](https://github.com/Lelekhoa1812/CVA/blob/main/cv-assistant/public/style4.pdf)  
*Give us feedback if you have any thought on improvements*

## ✨ Features

### 🎯 Core Functionality

#### Cover Letter Generation
- **AI-Powered Analysis**: Analyzes job descriptions and user profiles to identify relevant skills and experiences
- **Smart Content Generation**: Creates personalized, professional cover letters in minutes
- **Intelligent Skill Matching**: Automatically selects relevant projects and experiences
- **Real-time Generation**: Instant cover letter creation with copy-to-clipboard functionality

#### Resume Builder
- **Harvard-Style Templates**: Professional, ATS-friendly resume layouts
- **AI Coaching System**: Two-phase intelligent coaching for optimal results
  - **Styling Agent**: Customizes font sizes, bold/italic usage, and layout preferences
  - **Content Agent**: Enhances specific projects/experiences with targeted questions
- **Smart Content Enhancement**: 
  - Format options: Concise (50% shorter), Preserve (current length), Enhance (50% expanded)
  - Personalized modifications: Technical focus, leadership emphasis, metrics addition, ATS optimization
- **Dynamic PDF Generation**: Real-time preview with professional formatting
- **Multi-page Support**: Automatic pagination for comprehensive resumes

### 🎨 User Experience
- **Modern Design**: Beautiful, responsive UI with gradient backgrounds and smooth animations
- **Dark/Light Mode**: Toggle between themes with persistent preferences
- **Professional Styling**: Clean, modern interface that builds trust and credibility
- **Mobile Responsive**: Optimized for all device sizes with hamburger navigation
- **Interactive Elements**: Hover effects, progress indicators, and real-time feedback

### 🔧 Technical Features
- **TypeScript**: Full type safety and better development experience
- **Next.js 15**: Latest features with App Router and Server Components
- **Tailwind CSS**: Utility-first styling with custom design system
- **MongoDB**: Scalable database for user profiles and data storage
- **JWT Authentication**: Secure user authentication and session management
- **NVIDIA NIM**: Streamed AI requests, with model fallback and rotation across configured API keys
- **PDF Generation**: Professional PDF creation using pdf-lib
- **Profile import**: Resume parsing and information extraction

## 🚀 Quick Start

### Prerequisites
- Node.js 22
- npm or yarn
- MongoDB database
- At least one NVIDIA NIM API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Lelekhoa1812/CVA.git
   cd CVA/cv-assistant
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in `cv-assistant`:
   ```env
   # Database
   MONGO_URI=your_mongodb_connection_string
   
   # Authentication
   JWT_SECRET=your_jwt_secret_key
   
   # NVIDIA NIM: add up to nine keys; empty slots are ignored
   NVIDIA_NIM_API_KEY_1=your_nvidia_nim_api_key
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
cv-assistant/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/               # API routes
│   │   │   ├── auth/         # Authentication endpoints
│   │   │   ├── generate/     # Cover letter generation
│   │   │   ├── enhance/      # Content enhancement
│   │   │   ├── ocr/          # OCR functionality
│   │   │   ├── profile/      # Profile management
│   │   │   └── resume/       # Resume building endpoints
│   │   │       ├── style1/   # Harvard-style PDF generation (Style 1 - Classic)
│   │   │       ├── style2/   # Harvard-style PDF generation (Style 2 - Modern)
│   │   │       ├── coach/    # AI coaching system
│   │   │       ├── enhance-targeted/ # Targeted content enhancement
│   │   │       ├── style-parser/ # Style preference parsing
│   │   │       ├── beautify/ # Markdown beautification
│   │   │       ├── summarize/ # Content summarization
│   │   │       └── enhance/  # Content expansion
│   │   ├── generate/         # Cover letter generation page
│   │   ├── resume/           # Resume builder page
│   │   ├── login/            # Authentication pages
│   │   ├── profile/          # Profile management page
│   │   ├── globals.css       # Global styles
│   │   └── layout.tsx        # Root layout
│   ├── components/           # Reusable components
│   │   └── Navbar.tsx        # Navigation component with mobile support
│   ├── contexts/             # React contexts
│   │   └── ThemeContext.tsx  # Dark/light mode context
│   └── lib/                  # Utility libraries
│       ├── auth.ts           # Authentication utilities
│       ├── db.ts             # Database connection
│       ├── ai.ts             # NVIDIA NIM integration
│       └── models/           # Database models
├── public/                   # Static assets
├── imgsrc/                   # Application screenshots
│   ├── resume/              # Resume builder screenshots
│   ├── cv/                  # Cover letter screenshots
│   └── profile/             # Profile management screenshots
├── tailwind.config.ts        # Tailwind configuration
├── next.config.ts           # Next.js configuration
└── package.json             # Dependencies and scripts
```

## 🛠️ Configuration

### Tailwind CSS
The project uses a custom design system with CSS variables for consistent theming:

```css
:root {
  --primary: 221.2 83.2% 53.3%;
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --muted: 210 40% 96%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;
  --radius: 0.5rem;
}
```

### Database Schema
The application uses MongoDB with the following main collections:

- **Users**: Authentication and profile information
- **Experiences**: Professional experience entries with enhanced descriptions
- **Projects**: Project portfolio items with AI-enhanced content
- **Skills**: User skills and competencies

### 🤖 Auto Apply (assisted apply)

`/auto-apply` finds roles, reads each employer's real application form, and prepares complete applications that **you** submit.

1. **Brief** – role, location and standing answers (work rights, salary, notice, relocation). Sensitive answers come only from you, never from AI guesses.
2. **Matches** – roles from employer career sites (Greenhouse, Lever, Ashby, SmartRecruiters) plus job boards, LLM-scored against your profile. Autopilot picks the best matches; or choose manually.
3. **Review** – per-job answers and a tailored cover letter. Tick "Remember" to reuse an answer. Approve one job or "Approve all ready".
4. **Apply** – "Open form & copy pack" opens the employer form; the bookmarklet autofills it and never submits. Confirm "I submitted it" to track progress.

Pipeline runs after the response (`after()`, `maxDuration = 300`) and the UI polls the session. A heartbeat keeps healthy runs fresh; a run cut off by the serverless limit is detected after 150 s and the workspace recovers.

Cover letters come from one shared agent (`src/lib/cover-letter-service.ts`, the same prompt, claim check and model guard as `/generate`). The job description is crawled from the employer ATS API or listing page when the search snippet is thin (`src/lib/auto-apply/jd.ts`). "Rewrite from job posting" in Review re-runs it; `POST /api/auto-apply/job/[jobId]/cover-letter` also accepts `{ "advanced": true }` for the multi-step studio agent.

Choice questions are answered autonomously: the AI always picks a best-fit option (flagged as a suggestion), and only sensitive facts such as work rights, salary and sponsorship come from your saved answers. Optional local tools: `npm run agent:fill -- --pack pack.json [--resume cv.pdf]` fills a form with real browser input and blocks submissions; `npm run test:autofill-safari` runs real Safari once "Allow remote automation" is enabled.

Tests: `npm run test:auto-apply` (unit) and `npm run test:autofill-live` (real Greenhouse, Ashby and Lever forms in Chromium, Firefox and WebKit; needs network and `npx playwright install firefox webkit`).
The legacy Playwright live preview is dev-only: set `AUTO_APPLY_DEV_BROWSER=true` (never active in production).

## 🎯 Usage Guide

### 1. Getting Started
1. **Register/Login**: Create an account or sign in using the authentication interface
2. **Complete Profile**: Add your professional experience, skills, and projects
3. **Choose Service**: Use either cover letter generation or resume building

### 2. Creating a Cover Letter
1. Navigate to the **Generate** page
2. Enter the **Company Name**
3. Paste the **Job Description**
4. Choose whether to use AI for skill matching
5. Click **Generate Cover Letter**
6. Copy or customize the result

### 3. Building a Resume

#### Step 1: Basic Setup
1. Navigate to the **Resume** page
2. Select up to 7 projects and experiences from your profile
3. Add your skills and expertise
4. Choose AI enhancement options

#### Step 2: AI Coaching (Optional)
1. **Styling Customization**:
   - Font size preferences (10pt, 11pt, 12pt)
   - Bold/italic usage for emphasis
   - Layout and color preferences
   
2. **Content Enhancement**:
   - Select up to 3 specific items to enhance
   - Choose content format (concise/preserve/enhance)
   - Specify modification preferences
   - AI processes each item individually

#### Step 3: Generate PDF
1. Click **Generate PDF** button
2. Preview the generated resume
3. Download or retry if needed

### 4. Profile Management
- **Add Experience**: Include job titles, companies, and descriptions
- **Add Projects**: Showcase your portfolio with detailed descriptions
- **Manage Skills**: List your technical and soft skills
- **Update Information**: Keep your profile current
- **AI Enhancement**: Use AI to improve existing descriptions

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint

# Vercel (if using Vercel CLI)
npx vercel dev       # Start Vercel development server
npx vercel --prod    # Deploy to production
```

### Code Style
- **TypeScript**: Strict type checking enabled
- **ESLint**: Configured with Next.js recommended rules
- **Prettier**: Code formatting (recommended)

### Environment Variables
| Variable | Description | Required |
|----------|-------------|----------|
| `MONGO_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `NVIDIA_NIM_API_KEY_1` … `NVIDIA_NIM_API_KEY_9` | NVIDIA NIM API keys; configure at least one | Yes |
| `NEXT_PUBLIC_BASE_PATH` | Base path when the app is mounted below the domain root | No |

The model cascades can be adjusted with comma-separated `NVIDIA_NIM_EASY_MODELS`, `NVIDIA_NIM_HARD_MODELS`, `NVIDIA_NIM_DOCUMENT_MODELS`, and `NVIDIA_NIM_VISION_MODELS`. `NVIDIA_NIM_MAX_TOKENS` caps the output budget, subject to each model's limit.

## 🚀 Deployment

### Vercel (Recommended)
1. **Connect Repository**: Link your GitHub repository to Vercel
2. **Set Environment Variables**: Add all required environment variables
3. **Deploy**: Vercel will automatically build and deploy your app. Configure the NVIDIA keys for each target environment before deploying.

Key rotation and cooldowns are maintained per running server instance. Vercel may run several instances independently, so provider-side limits still apply across instances. Streaming keeps a response open while output arrives; it does not guarantee a fast first token or remove the platform's function duration limit.

### Manual Deployment
1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Start the production server**:
   ```bash
   npm run start
   ```

### Docker (Optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 🔒 Security

### Authentication
- JWT-based authentication
- Secure password hashing with bcrypt
- Protected API routes

### Data Protection
- Input validation and sanitization
- MongoDB injection protection
- Secure environment variable handling

### API Security
- Rate limiting (recommended for production)
- CORS configuration
- Request validation

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines
- Follow TypeScript best practices
- Write meaningful commit messages
- Add tests for new features
- Update documentation as needed

## 📝 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Profile Endpoints
- `GET /api/profile` - Get user profile
- `POST /api/profile` - Update user profile

### Cover Letter Generation
- `POST /api/generate/cover-letter` - Generate cover letter
- `POST /api/generate/select` - Select relevant items

### Resume Building
- `POST /api/resume/style1` - Generate Harvard-style PDF resume (Classic layout)
- `POST /api/resume/style2` - Generate Harvard-style PDF resume (Modern layout)
- `POST /api/resume/coach` - AI coaching system
- `POST /api/resume/enhance-targeted` - Targeted content enhancement
- `POST /api/resume/style-parser` - Parse styling preferences
- `POST /api/resume/beautify` - Markdown beautification
- `POST /api/resume/summarize` - Content summarization
- `POST /api/resume/enhance` - Content expansion

### Content Enhancement
- `POST /api/enhance` - General content enhancement
- `POST /api/ocr` - Profile import from pasted text, DOCX, or PDF (up to 12 pages)

## 🐛 Troubleshooting

### Common Issues

**Build Errors**
- Ensure all environment variables are set
- Check Node.js version (22 recommended)
- Clear `.next` cache: `rm -rf .next`

**Database Connection**
- Verify MongoDB URI format
- Check network connectivity
- Ensure database permissions

**AI Generation Issues**
- Verify at least one NVIDIA NIM API key is configured for the current environment
- Check API quota limits
- Review request format

**PDF Generation Issues**
- Check if selected items have content
- Verify styling preferences are set
- Ensure proper content enhancement completion

### Performance Optimization
- Enable Next.js caching
- Optimize images and assets
- Use CDN for static files
- Implement database indexing

## 🔮 Future Features

### Planned Enhancements
- **Multiple Resume Templates**: Additional professional styles
- **Advanced AI Coaching**: More sophisticated content enhancement
- **Export Options**: Multiple format support (Word, LaTeX)
- **Collaboration**: Team resume building and review
- **Analytics**: Resume performance tracking and optimization

### AI Improvements
- **Multi-language Support**: Resume generation in multiple languages
- **Industry-specific Optimization**: Tailored content for different sectors
- **Real-time Feedback**: Live suggestions during content creation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/Lelekhoa1812/CVA/blob/main/LICENSE.txt) file for details.

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Lelekhoa1812/CVA/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Lelekhoa1812/CVA/discussions)
- **Email**: binkhoa1812@gmail.com

---

*Transform your professional presence with AI-powered resume building and cover letter generation that stands out to employers.*

**Built with ❤️ using Next.js, TypeScript, and NVIDIA NIM**
