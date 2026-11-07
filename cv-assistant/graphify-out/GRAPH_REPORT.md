# Graph Report - cv-assistant  (2026-11-05)

## Corpus Check
- 187 files · ~104,553 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1561 nodes · 3867 edges · 70 communities (66 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8035dfb2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- sources.ts
- career/run-tests.ts
- profile/route.ts
- schema.ts
- career/types.ts
- cover-letter-advanced.ts
- pdf-renderer.ts
- ai.ts
- ai-coaching.ts
- stream/route.ts
- User.ts
- control-room.ts
- text-section-prompts.ts
- pdf/route.ts
- routes.ts
- control-room/page.tsx
- search/page.tsx
- profile/page.tsx
- resume-specialist.ts
- generate/page.tsx
- connectToDatabase
- clarifications.test.ts
- buildApiUrl
- cleanText
- prepare/route.ts
- requireAutoApplyAuth
- auto-apply/types.ts
- auto-apply/page.tsx
- Navbar.tsx
- package.json
- wrapTextLines
- cover-letter.ts
- labels.ts
- ClarificationQuestions.tsx
- ProfilePage
- drawTemplate4
- compilerOptions
- context.ts
- cover-letter/route.ts
- getAuthFromCookies
- search/types.ts
- dependencies
- cn
- UserContext.ts
- ExperienceLocationInjector.tsx
- devDependencies
- auth.ts
- answer/route.ts
- GeneratePage
- persistence.ts
- normalizeInline
- resume/page.tsx
- Reveal.tsx
- useResumeStudio
- scripts
- SourceRail.tsx
- CoachingPanel.tsx
- profile-import.ts
- rewriteTextSection
- Career evaluation pipeline (backward compatibility)
- eslint.config.mjs
- button.tsx
- save
- filters.ts
- vercel.json
- middleware.ts
- react
- postcss.config.mjs

## God Nodes (most connected - your core abstractions)
1. `cn()` - 63 edges
2. `getAuthFromCookies()` - 60 edges
3. `connectToDatabase()` - 56 edges
4. `buildApiUrl()` - 49 edges
5. `getModel()` - 37 edges
6. `requireAutoApplyAuth()` - 36 edges
7. `react` - 35 edges
8. `isAuthPayload()` - 35 edges
9. `generateJsonSafe()` - 32 edges
10. `cleanText()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `request()` --calls--> `getModel()`  [EXTRACTED]
  tests/ai/run-tests.ts → src/lib/ai.ts
- `collectEvents()` --calls--> `streamSearchJobs()`  [EXTRACTED]
  tests/search/run-tests.ts → src/lib/search/server/stream.ts
- `selectRelevant()` --calls--> `buildApiUrl()`  [EXTRACTED]
  src/app/generate/page.tsx → src/lib/api.ts
- `exportPdf()` --calls--> `buildApiUrl()`  [EXTRACTED]
  src/app/generate/page.tsx → src/lib/api.ts
- `logout()` --calls--> `buildApiUrl()`  [EXTRACTED]
  src/components/Navbar.tsx → src/lib/api.ts

## Import Cycles
- None detected.

## Communities (70 total, 2 thin omitted)

### Community 0 - "sources.ts"
Cohesion: 0.06
Nodes (70): cheerio, AUTOMATIC_RETRY_MESSAGE, buildFallbackQuery(), discoverFallbackUrls(), extractDuckDuckGoCandidateUrls(), SOURCE_DOMAINS, SOURCE_HINTS, buildLinkedInSearchUrl() (+62 more)

### Community 1 - "career/run-tests.ts"
Cohesion: 0.07
Nodes (55): allowedActions, dynamic, POST(), runtime, detectAutomationBlockers(), JOB_PLATFORM_HOST_PATTERNS, BrowserSession, BrowserSessionResult (+47 more)

### Community 2 - "profile/route.ts"
Cohesion: 0.09
Nodes (51): cleanString(), coerceSerializableProfile(), createStableHash(), createSummarizer(), ensureCreatedAt(), findExistingExperience(), GET(), getExperienceContentHash() (+43 more)

### Community 3 - "schema.ts"
Cohesion: 0.16
Nodes (18): advancedSearchAnswerSchema, advancedSearchQuestionPlanSchema, advancedSearchQuestionSchema, advancedSearchSessionSchema, defaultSearchRequest, searchFiltersSchema, searchInstructionContextSchema, searchInstructionExpansionSchema (+10 more)

### Community 4 - "career/types.ts"
Cohesion: 0.08
Nodes (38): applyHardGuardrails(), contextJson(), dimensionScoreSchema, ensureGapCodes(), gapSchema, buildRequirementMatches(), candidateKeywordPool(), LeadLike (+30 more)

### Community 5 - "cover-letter-advanced.ts"
Cohesion: 0.12
Nodes (35): AdvancedCoverLetterResult, AdvancedGenerationTrace, AdvancedRequirement, buildAdvancedCoverLetterPrompt(), buildAdvancedEmployerAnswerPrompt(), buildAdvancedEvidenceContext(), buildCoveragePlannerPrompt(), buildFinalItems() (+27 more)

### Community 6 - "pdf-renderer.ts"
Cohesion: 0.08
Nodes (33): accentColor(), applyStylePreferenceDensity(), CandidateItem, collectBackfillItems(), collectItems(), DENSITIES, DensityPreset, deriveKeywords() (+25 more)

### Community 7 - "ai.ts"
Cohesion: 0.14
Nodes (25): availableKeys(), ContentRole, createResponse(), DEFAULT_MODELS, GenerateContentPayload, GenerateContentResult, getAutoApplySupervisorModel(), getConfigValue() (+17 more)

### Community 8 - "ai-coaching.ts"
Cohesion: 0.08
Nodes (39): generateJsonSafe(), AICoachingResult, AICoachingValidationError, analyzeJobDescription(), AtsReview, atsReviewSchema, buildConsultantBoardPlan(), clampScore() (+31 more)

### Community 9 - "stream/route.ts"
Cohesion: 0.13
Nodes (16): dynamic, POST(), runtime, completePersistedSearchCampaign(), createPersistedSearchCampaign(), recordSearchLead(), PersistedSearchCampaignInput, JobLead (+8 more)

### Community 10 - "User.ts"
Cohesion: 0.12
Nodes (25): POST(), requestSchema, POST(), POST(), POST(), POST(), POST(), Experience (+17 more)

### Community 11 - "control-room.ts"
Cohesion: 0.06
Nodes (45): dynamic, POST(), runtime, dynamic, GET(), runtime, dynamic, GET() (+37 more)

### Community 12 - "text-section-prompts.ts"
Cohesion: 0.15
Nodes (25): POST(), POST(), buildHighImpactRewritePrompt(), BulletRange, getBulletRange(), HighImpactRewritePromptParams, normalizeHighImpactBulletOutput(), resolveRewriteMode() (+17 more)

### Community 13 - "pdf/route.ts"
Cohesion: 0.11
Nodes (26): pdf-lib, @pdf-lib/fontkit, ACCENT, ACCENT_SOFT, BORDER, createFonts(), extractLetterParagraphs(), INK (+18 more)

### Community 14 - "routes.ts"
Cohesion: 0.09
Nodes (27): mongoose, dynamic, POST(), runtime, dynamic, POST(), runtime, dynamic (+19 more)

### Community 15 - "control-room/page.tsx"
Cohesion: 0.12
Nodes (26): BLOCKER_SEVERITY_CLASSES, BLOCKER_SEVERITY_LABELS, ContextFormState, ControlRoomPage(), runWorkflow(), saveContext(), coverageClasses(), createContextForm() (+18 more)

### Community 16 - "search/page.tsx"
Cohesion: 0.11
Nodes (26): AdvancedSearchQuestionDraft, buildAdvancedSearchSession(), buildQuestionHelper(), buildQuestionId(), CompletionSummary, formatElapsed(), formatInstructionExpansionSummary(), getDuplicateGroupCount() (+18 more)

### Community 17 - "profile/page.tsx"
Cohesion: 0.10
Nodes (21): emptyProfile, ensureClientIds(), Experience, FieldProps, getListIdentity(), hydrateExperiences(), hydrateList(), hydrateProfile() (+13 more)

### Community 18 - "resume-specialist.ts"
Cohesion: 0.19
Nodes (15): REQUIRED_SECTIONS, validateResumeDraft(), buildResumeDraft(), createTailoringArtifacts(), escapeHtml(), LeadLike, renderResumeVariant(), StoredProfile (+7 more)

### Community 19 - "generate/page.tsx"
Cohesion: 0.08
Nodes (26): AdvancedTrace, Experience, GENERATE_STEPS, loadSavedDraft(), normalizeNumberArray(), normalizeTrace(), Profile, Project (+18 more)

### Community 20 - "connectToDatabase"
Cohesion: 0.15
Nodes (18): dynamic, POST(), runtime, PATCH(), GET(), buildGroundTruthOptions(), buildGroundTruthSnapshot(), clean() (+10 more)

### Community 21 - "clarifications.test.ts"
Cohesion: 0.15
Nodes (19): POST(), buildClarificationsPrompt(), clean(), isFillerOption(), normalizeClarificationQuestions(), readOption(), sanitizeClarificationQuestions(), answers (+11 more)

### Community 22 - "buildApiUrl"
Cohesion: 0.21
Nodes (22): AutoApplyPage(), askAnswer(), createSession(), handleProfileUpdated(), handleStorage(), loadReview(), noteUserActivity(), prepareJob() (+14 more)

### Community 23 - "cleanText"
Cohesion: 0.20
Nodes (23): buildFallbackJobUnderstanding(), extractJobUnderstandingWithLlm(), filterKeywordCandidates(), isLikelyNoiseToken(), jobUnderstandingSchema, JobUnderstandingValidated, mergeKeywordsForAts(), normalizeUnderstanding() (+15 more)

### Community 24 - "prepare/route.ts"
Cohesion: 0.18
Nodes (14): dynamic, POST(), runtime, dynamic, POST(), rankSelectedItemsForJob(), runtime, dynamic (+6 more)

### Community 25 - "requireAutoApplyAuth"
Cohesion: 0.15
Nodes (22): dynamic, GET(), runtime, dynamic, POST(), runtime, dynamic, POST() (+14 more)

### Community 26 - "auto-apply/types.ts"
Cohesion: 0.13
Nodes (18): zod, dynamic, POST(), runtime, dynamic, POST(), runtime, upsertRankedCandidates() (+10 more)

### Community 27 - "auto-apply/page.tsx"
Cohesion: 0.13
Nodes (18): BrowserPreviewState, buildGroundTruthSections(), displayAutoApplyIdentifier(), Draft, employmentLabels, EventItem, GroundTruthOption, initialAutoApplyForm (+10 more)

### Community 28 - "Navbar.tsx"
Cohesion: 0.12
Nodes (14): configuredBasePath, nextConfig, next, bodyFont, displayFont, metadata, links, Navbar() (+6 more)

### Community 29 - "package.json"
Cohesion: 0.10
Nodes (20): name, private, version, autoprefixer, eslint, eslint-config-next, formidable, jsonwebtoken (+12 more)

### Community 30 - "wrapTextLines"
Cohesion: 0.17
Nodes (19): drawCharacterSpacedText(), drawRightAlignedText(), fallbackParagraphs(), renderCoverLetterPdf(), addPage(), drawLabelValue(), drawPageFurniture(), drawParagraph() (+11 more)

### Community 31 - "cover-letter.ts"
Cohesion: 0.16
Nodes (17): POST(), buildCoverLetterPrompt(), buildEmployerQuestionPrompt(), buildExperienceRankingPrompt(), cleanText(), CoverLetterItem, CoverLetterProfile, formatEvidencePromptBlock() (+9 more)

### Community 32 - "labels.ts"
Cohesion: 0.12
Nodes (22): CrawlFilters(), CrawlFiltersProps, employmentLabels, MATCH_FILTER_OPTIONS, MatchFilter, matchLabels, PLATFORM_FILTER_OPTIONS, PlatformFilter (+14 more)

### Community 33 - "ClarificationQuestions.tsx"
Cohesion: 0.15
Nodes (12): answersFor(), ClarificationQuestions(), continueForward(), skipCurrent(), validateCurrent(), ClarificationAnswer, ClarificationQuestion, ClarificationQuestions (+4 more)

### Community 34 - "ProfilePage"
Cohesion: 0.17
Nodes (19): createClientId(), prioritizeFreshEntries(), ProfilePage(), addExperience(), addProject(), applyImportedData(), commitProfile(), copyExperience() (+11 more)

### Community 35 - "drawTemplate4"
Cohesion: 0.32
Nodes (20): createDrawContext(), bullets(), ensure(), newPage(), paragraph(), section(), drawEducation(), drawItemList() (+12 more)

### Community 36 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 37 - "context.ts"
Cohesion: 0.13
Nodes (27): dynamic, GET(), PATCH(), runtime, dynamic, POST(), runtime, dynamic (+19 more)

### Community 38 - "cover-letter/route.ts"
Cohesion: 0.22
Nodes (15): ModelName, POST(), ModelName, POST(), getCoverLetterItems(), selectCoverLetterItems(), checkDraftClaims(), formatClarificationAnswers() (+7 more)

### Community 39 - "getAuthFromCookies"
Cohesion: 0.22
Nodes (12): generateWithFallback(), tryGenerate(), generateWithFallback(), tryGenerate(), POST(), POST(), POST(), POST() (+4 more)

### Community 40 - "search/types.ts"
Cohesion: 0.16
Nodes (14): applicationLabels, formatDuplicateLabel(), matchLabels, ResultCard(), ResultCardProps, AdvancedSearchAnswer, AdvancedSearchQuestion, AdvancedSearchSession (+6 more)

### Community 41 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, bcrypt, cheerio, formidable, framer-motion, jsonwebtoken, mammoth, mongoose (+9 more)

### Community 42 - "cn"
Cohesion: 0.11
Nodes (32): StylePickerDialog(), StylePickerDialogProps, StylePreviewFrame(), Badge(), BadgeProps, badgeVariant, Card(), CardContent() (+24 more)

### Community 43 - "UserContext.ts"
Cohesion: 0.13
Nodes (14): CandidateFact, CandidateFactSchema, StoryBankItem, StoryBankItemSchema, CalibrationSchema, CompensationPreferencesSchema, ControlRoomPreferencesSchema, CultureSignalSchema (+6 more)

### Community 44 - "ExperienceLocationInjector.tsx"
Cohesion: 0.23
Nodes (12): Experience, ExperienceLocationInjector(), handleDocumentClick(), inject(), loadProfile(), saveExperienceLocations(), saveSingleLocation(), getExperienceCards() (+4 more)

### Community 45 - "devDependencies"
Cohesion: 0.14
Nodes (14): devDependencies, autoprefixer, eslint, eslint-config-next, @eslint/eslintrc, postcss, tailwindcss, tsconfig-paths (+6 more)

### Community 46 - "auth.ts"
Cohesion: 0.29
Nodes (10): bcrypt, POST(), POST(), POST(), attachAuthCookie(), AuthTokenPayload, clearAuthCookieOnResponse(), getJwtSecret() (+2 more)

### Community 47 - "answer/route.ts"
Cohesion: 0.20
Nodes (11): dynamic, POST(), runtime, answerEmployerQuestionFromGroundTruth(), classifyEmployerQuestion(), sensitivePatterns, flattenGroundTruthText(), answerQuestionSchema (+3 more)

### Community 48 - "GeneratePage"
Cohesion: 0.23
Nodes (12): clampManualSelection(), GeneratePage(), answerEmployerQuestion(), exportPdf(), generate(), getFinalIndices(), prepareGuidance(), selectRelevant() (+4 more)

### Community 49 - "persistence.ts"
Cohesion: 0.31
Nodes (12): createAutoApplyDedupeKey(), createAutoApplyExactDuplicateKey(), dedupeJobs(), includesNormalized(), isPlaceholderCompany(), normalize(), PLACEHOLDER_COMPANIES, RankableJob (+4 more)

### Community 50 - "normalizeInline"
Cohesion: 0.31
Nodes (13): buildContactLine(), compactSkillsFallback(), compactSummaryFallback(), compactWords(), drawCentered(), drawHeaderClassic(), drawHeaderLeft(), drawRule() (+5 more)

### Community 51 - "resume/page.tsx"
Cohesion: 0.12
Nodes (15): SECTION_LINKS, AICoachingInput(), AICoachingInputProps, SelectionItem, SelectionList(), SelectionListProps, controlClassName, Input (+7 more)

### Community 52 - "Reveal.tsx"
Cohesion: 0.23
Nodes (9): framer-motion, pillars, stats, ease, Reveal(), RevealProps, StaggerGroup(), StaggerItem() (+1 more)

### Community 53 - "useResumeStudio"
Cohesion: 0.16
Nodes (11): ResumePage(), parseStylingPreferences(), useResumeStudio(), confirmStyle(), handleQuestionSubmit(), moveToNextContentItem(), requestResumePreview(), saveStylePreferences() (+3 more)

### Community 54 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, dev, lint, start, test:ai, test:search, test:unit (+1 more)

### Community 55 - "SourceRail.tsx"
Cohesion: 0.31
Nodes (9): isAutomaticRetry(), sourceVisualClass(), sourceVisualLabel(), sourceVisualStatus, formatElapsed(), sourceProgressCopy(), SourceRail(), SourceRailProps (+1 more)

### Community 56 - "CoachingPanel.tsx"
Cohesion: 0.14
Nodes (19): ACCENTS, CoachingPanel(), CoachingPanelProps, FONT_SIZE_OPTIONS, readableMessage(), STYLE_OPTIONS, AccentColor, CoachingAgent (+11 more)

### Community 57 - "profile-import.ts"
Cohesion: 0.19
Nodes (16): mammoth, @napi-rs/canvas, dynamic, POST(), runtime, cleanText(), detectImportMimeType(), extractJsonPayload() (+8 more)

### Community 58 - "rewriteTextSection"
Cohesion: 0.29
Nodes (8): cleanString(), getTextSectionExploreContext(), hasTextSectionExploreEvidence(), mergeImportedProfile(), copyTextSection(), getTextSectionContent(), rewriteTextSection(), up()

### Community 59 - "Career evaluation pipeline (backward compatibility)"
Cohesion: 0.33
Nodes (5): Career evaluation pipeline (backward compatibility), Field map, Heatmap policy, Migration (re-score), Motivation vs Logic

### Community 60 - "eslint.config.mjs"
Cohesion: 0.33
Nodes (5): compat, __dirname, eslintConfig, __filename, @eslint/eslintrc

### Community 61 - "button.tsx"
Cohesion: 0.23
Nodes (10): ResumeGate(), ResumePreview(), ResumePreviewProps, Button, ButtonProps, ButtonSize, ButtonVariant, buttonVariants() (+2 more)

### Community 62 - "save"
Cohesion: 0.33
Nodes (5): save(), stripClientIds(), broadcastProfileUpdated(), PROFILE_UPDATED_EVENT, PROFILE_UPDATED_STORAGE_KEY

### Community 63 - "filters.ts"
Cohesion: 0.50
Nodes (7): cleanText(), inferEmploymentType(), inferWorkplaceMode(), parsePostedAgeDays(), passesPostFilters(), WORD_NUMBERS, wordToNumber()

### Community 64 - "vercel.json"
Cohesion: 0.33
Nodes (5): buildCommand, devCommand, framework, installCommand, outputDirectory

### Community 67 - "react"
Cohesion: 0.24
Nodes (9): react, LoginPage(), handleSubmit(), redirectToAuthenticatedApp(), GlassPanel(), GlassPanelProps, ModuleShell(), ModuleShellProps (+1 more)

## Knowledge Gaps
- **489 isolated node(s):** `__filename`, `__dirname`, `compat`, `eslintConfig`, `configuredBasePath` (+484 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 550 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `labels.ts`, `ClarificationQuestions.tsx`, `cn`, `ExperienceLocationInjector.tsx`, `control-room/page.tsx`, `search/page.tsx`, `profile/page.tsx`, `generate/page.tsx`, `resume/page.tsx`, `Reveal.tsx`, `button.tsx`, `CoachingPanel.tsx`, `auto-apply/page.tsx`, `Navbar.tsx`, `package.json`?**
  _High betweenness centrality (0.129) - this node is a cross-community bridge._
- **Why does `buildApiUrl()` connect `buildApiUrl` to `ProfilePage`, `ExperienceLocationInjector.tsx`, `control-room/page.tsx`, `GeneratePage`, `profile/page.tsx`, `search/page.tsx`, `generate/page.tsx`, `useResumeStudio`, `CoachingPanel.tsx`, `rewriteTextSection`, `auto-apply/page.tsx`, `Navbar.tsx`, `save`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `getAuthFromCookies()` connect `getAuthFromCookies` to `profile/route.ts`, `context.ts`, `cover-letter/route.ts`, `stream/route.ts`, `User.ts`, `control-room.ts`, `text-section-prompts.ts`, `pdf/route.ts`, `auth.ts`, `routes.ts`, `clarifications.test.ts`, `profile-import.ts`, `requireAutoApplyAuth`, `cover-letter.ts`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **What connects `__filename`, `__dirname`, `compat` to the rest of the system?**
  _489 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `sources.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.057942057942057944 - nodes in this community are weakly interconnected._
- **Should `career/run-tests.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06597222222222222 - nodes in this community are weakly interconnected._
- **Should `profile/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09071117561683599 - nodes in this community are weakly interconnected._