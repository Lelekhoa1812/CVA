# Graph Report - cv-assistant  (2026-11-05)

## Corpus Check
- 168 files · ~101,516 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1454 nodes · 3561 edges · 72 communities (67 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c055dc04`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- sources.ts
- career/run-tests.ts
- profile/route.ts
- stream/route.ts
- career/types.ts
- cover-letter-advanced.ts
- pdf-renderer.ts
- ai.ts
- ai-coaching.ts
- control-room.ts
- connectToDatabase
- workflow.ts
- text-section-prompts.ts
- pdf/route.ts
- routes.ts
- control-room/page.tsx
- search/page.tsx
- profile/page.tsx
- cleanText
- react
- [id]/route.ts
- clarifications.test.ts
- buildApiUrl
- market-analyst.ts
- prepare/route.ts
- requireAutoApplyAuth
- auto-apply/types.ts
- auto-apply/page.tsx
- Navbar.tsx
- package.json
- wrapTextLines
- cover-letter.ts
- labels.ts
- generate/page.tsx
- ProfilePage
- drawTemplate4
- compilerOptions
- context.ts
- generateJsonSafe
- getAuthFromCookies
- search/types.ts
- dependencies
- profile-draft.ts
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
- ResumePage
- scripts
- SourceRail.tsx
- User.ts
- clarifications-ui.test.ts
- rewriteTextSection
- Career evaluation pipeline (backward compatibility)
- eslint.config.mjs
- save-answer/route.ts
- save
- SearchSource
- vercel.json
- SOURCE_LABELS
- middleware.ts
- LoginPage
- TracePanel.tsx
- postcss.config.mjs

## God Nodes (most connected - your core abstractions)
1. `getAuthFromCookies()` - 60 edges
2. `connectToDatabase()` - 56 edges
3. `buildApiUrl()` - 48 edges
4. `getModel()` - 37 edges
5. `requireAutoApplyAuth()` - 36 edges
6. `isAuthPayload()` - 35 edges
7. `generateJsonSafe()` - 32 edges
8. `cleanText()` - 29 edges
9. `ProfilePage()` - 26 edges
10. `AutoApplyPage()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `request()` --calls--> `getModel()`  [EXTRACTED]
  tests/ai/run-tests.ts → src/lib/ai.ts
- `main()` --calls--> `generateJsonSafe()`  [EXTRACTED]
  tests/ai/run-tests.ts → src/lib/ai.ts
- `collectEvents()` --calls--> `streamSearchJobs()`  [EXTRACTED]
  tests/search/run-tests.ts → src/lib/search/server/stream.ts
- `selectRelevant()` --calls--> `buildApiUrl()`  [EXTRACTED]
  src/app/generate/page.tsx → src/lib/api.ts
- `exportPdf()` --calls--> `buildApiUrl()`  [EXTRACTED]
  src/app/generate/page.tsx → src/lib/api.ts

## Import Cycles
- None detected.

## Communities (72 total, 3 thin omitted)

### Community 0 - "sources.ts"
Cohesion: 0.05
Nodes (78): cheerio, cleanText(), inferEmploymentType(), inferWorkplaceMode(), parsePostedAgeDays(), passesPostFilters(), WORD_NUMBERS, wordToNumber() (+70 more)

### Community 1 - "career/run-tests.ts"
Cohesion: 0.06
Nodes (50): mammoth, @napi-rs/canvas, dynamic, POST(), runtime, detectAutomationBlockers(), JOB_PLATFORM_HOST_PATTERNS, BrowserSession (+42 more)

### Community 2 - "profile/route.ts"
Cohesion: 0.09
Nodes (51): cleanString(), coerceSerializableProfile(), createStableHash(), createSummarizer(), ensureCreatedAt(), findExistingExperience(), GET(), getExperienceContentHash() (+43 more)

### Community 3 - "stream/route.ts"
Cohesion: 0.07
Nodes (38): dynamic, POST(), runtime, dynamic, POST(), runtime, dynamic, POST() (+30 more)

### Community 4 - "career/types.ts"
Cohesion: 0.07
Nodes (39): zod, applyHardGuardrails(), contextJson(), dimensionScoreSchema, ensureGapCodes(), gapSchema, buildRequirementMatches(), candidateKeywordPool() (+31 more)

### Community 5 - "cover-letter-advanced.ts"
Cohesion: 0.12
Nodes (35): AdvancedCoverLetterResult, AdvancedGenerationTrace, AdvancedRequirement, buildAdvancedCoverLetterPrompt(), buildAdvancedEmployerAnswerPrompt(), buildAdvancedEvidenceContext(), buildCoveragePlannerPrompt(), buildFinalItems() (+27 more)

### Community 6 - "pdf-renderer.ts"
Cohesion: 0.07
Nodes (35): accentColor(), applyStylePreferenceDensity(), CandidateItem, collectBackfillItems(), collectItems(), DENSITIES, DensityPreset, deriveKeywords() (+27 more)

### Community 7 - "ai.ts"
Cohesion: 0.11
Nodes (32): availableKeys(), ContentRole, createResponse(), DEFAULT_MODELS, GenerateContentPayload, GenerateContentResult, getAutoApplySupervisorModel(), getConfigValue() (+24 more)

### Community 8 - "ai-coaching.ts"
Cohesion: 0.10
Nodes (30): AICoachingResult, AICoachingValidationError, analyzeJobDescription(), AtsReview, atsReviewSchema, buildConsultantBoardPlan(), clampScore(), collectResumeItems() (+22 more)

### Community 9 - "control-room.ts"
Cohesion: 0.11
Nodes (26): dynamic, GET(), runtime, dynamic, GET(), runtime, buildLeadDisplayInfo(), buildStrategistRecommendations() (+18 more)

### Community 10 - "connectToDatabase"
Cohesion: 0.19
Nodes (19): POST(), requestSchema, POST(), POST(), POST(), POST(), POST(), GET() (+11 more)

### Community 11 - "workflow.ts"
Cohesion: 0.10
Nodes (22): dynamic, POST(), runtime, loadOutcomeTelemetry(), orchestrateLead(), StoredProfile, ApplicationEvent, ApplicationEventModel (+14 more)

### Community 12 - "text-section-prompts.ts"
Cohesion: 0.15
Nodes (25): POST(), POST(), buildHighImpactRewritePrompt(), BulletRange, getBulletRange(), HighImpactRewritePromptParams, normalizeHighImpactBulletOutput(), resolveRewriteMode() (+17 more)

### Community 13 - "pdf/route.ts"
Cohesion: 0.11
Nodes (26): pdf-lib, @pdf-lib/fontkit, ACCENT, ACCENT_SOFT, BORDER, createFonts(), extractLetterParagraphs(), INK (+18 more)

### Community 14 - "routes.ts"
Cohesion: 0.12
Nodes (20): mongoose, dynamic, POST(), runtime, dynamic, POST(), runtime, loadOwnedDraft() (+12 more)

### Community 15 - "control-room/page.tsx"
Cohesion: 0.12
Nodes (26): BLOCKER_SEVERITY_CLASSES, BLOCKER_SEVERITY_LABELS, ContextFormState, ControlRoomPage(), runWorkflow(), saveContext(), coverageClasses(), createContextForm() (+18 more)

### Community 16 - "search/page.tsx"
Cohesion: 0.13
Nodes (21): AdvancedSearchQuestionDraft, buildAdvancedSearchSession(), buildQuestionHelper(), buildQuestionId(), CompletionSummary, formatElapsed(), formatInstructionExpansionSummary(), getDuplicateGroupCount() (+13 more)

### Community 17 - "profile/page.tsx"
Cohesion: 0.10
Nodes (21): emptyProfile, ensureClientIds(), Experience, FieldProps, getListIdentity(), hydrateExperiences(), hydrateList(), hydrateProfile() (+13 more)

### Community 18 - "cleanText"
Cohesion: 0.18
Nodes (21): REQUIRED_SECTIONS, validateResumeDraft(), deriveStoryBank(), buildResumeDraft(), createTailoringArtifacts(), escapeHtml(), LeadLike, renderResumeVariant() (+13 more)

### Community 19 - "react"
Cohesion: 0.15
Nodes (14): react, GenerateStep, SectionNavigator(), SectionNavigatorProps, ChoiceRow(), DetailsToggle(), DisclosureSection(), SelectableRow() (+6 more)

### Community 20 - "[id]/route.ts"
Cohesion: 0.14
Nodes (20): dynamic, GET(), runtime, dynamic, GET(), PATCH(), runtime, buildGroundTruthOptions() (+12 more)

### Community 21 - "clarifications.test.ts"
Cohesion: 0.14
Nodes (21): POST(), selectCoverLetterItems(), buildClarificationsPrompt(), clean(), isFillerOption(), normalizeClarificationAnswers(), normalizeClarificationQuestions(), readOption() (+13 more)

### Community 22 - "buildApiUrl"
Cohesion: 0.21
Nodes (22): AutoApplyPage(), askAnswer(), createSession(), handleProfileUpdated(), handleStorage(), loadReview(), noteUserActivity(), prepareJob() (+14 more)

### Community 23 - "market-analyst.ts"
Cohesion: 0.20
Nodes (20): buildFallbackJobUnderstanding(), extractJobUnderstandingWithLlm(), filterKeywordCandidates(), isLikelyNoiseToken(), jobUnderstandingSchema, JobUnderstandingValidated, mergeKeywordsForAts(), normalizeUnderstanding() (+12 more)

### Community 24 - "prepare/route.ts"
Cohesion: 0.14
Nodes (18): allowedActions, dynamic, POST(), runtime, dynamic, POST(), runtime, dynamic (+10 more)

### Community 25 - "requireAutoApplyAuth"
Cohesion: 0.16
Nodes (18): dynamic, POST(), runtime, dynamic, POST(), runtime, dynamic, POST() (+10 more)

### Community 26 - "auto-apply/types.ts"
Cohesion: 0.13
Nodes (19): dynamic, POST(), runtime, dynamic, POST(), runtime, getUserSession(), upsertRankedCandidates() (+11 more)

### Community 27 - "auto-apply/page.tsx"
Cohesion: 0.12
Nodes (20): BrowserPreviewState, buildGroundTruthSections(), displayAutoApplyIdentifier(), Draft, employmentLabels, EventItem, GroundTruthOption, initialAutoApplyForm (+12 more)

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
Nodes (18): POST(), buildCoverLetterPrompt(), buildEmployerQuestionPrompt(), buildExperienceRankingPrompt(), cleanText(), CoverLetterItem, CoverLetterProfile, formatEvidencePromptBlock() (+10 more)

### Community 32 - "labels.ts"
Cohesion: 0.17
Nodes (17): employmentLabels, MATCH_FILTER_OPTIONS, MatchFilter, matchLabels, PLATFORM_FILTER_OPTIONS, PlatformFilter, platformLabels, postedLabels (+9 more)

### Community 33 - "generate/page.tsx"
Cohesion: 0.15
Nodes (16): AdvancedTrace, Experience, loadSavedDraft(), normalizeNumberArray(), normalizeTrace(), Profile, Project, RankedEvidence (+8 more)

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
Cohesion: 0.21
Nodes (16): dynamic, GET(), PATCH(), runtime, buildSourceHash(), createEmptySnapshot(), DEFAULT_CONTROL_ROOM_PREFERENCES, deriveCandidateFacts() (+8 more)

### Community 38 - "generateJsonSafe"
Cohesion: 0.22
Nodes (12): ModelName, POST(), ModelName, POST(), generateJsonSafe(), checkDraftClaims(), formatClarificationAnswers(), validateGenerationInput() (+4 more)

### Community 39 - "getAuthFromCookies"
Cohesion: 0.22
Nodes (12): generateWithFallback(), tryGenerate(), generateWithFallback(), tryGenerate(), POST(), POST(), POST(), POST() (+4 more)

### Community 40 - "search/types.ts"
Cohesion: 0.13
Nodes (14): CrawlFilters(), CrawlFiltersProps, AdvancedSearchAnswer, AdvancedSearchQuestion, AdvancedSearchSession, ApplicationUrlType, CompleteEvent, MAX_RESULTS_OPTIONS (+6 more)

### Community 41 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, bcrypt, cheerio, formidable, framer-motion, jsonwebtoken, mammoth, mongoose (+9 more)

### Community 42 - "profile-draft.ts"
Cohesion: 0.32
Nodes (16): AutoApplyProfileDraft, buildCompactPrompt(), cleanText(), dedupeStrings(), distillAutoApplyProfileDraft(), extractCompactRole(), fallbackDraft(), KEYWORD_STOP_WORDS (+8 more)

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
Cohesion: 0.27
Nodes (10): clampManualSelection(), GeneratePage(), answerEmployerQuestion(), exportPdf(), generate(), getFinalIndices(), prepareGuidance(), selectRelevant() (+2 more)

### Community 49 - "persistence.ts"
Cohesion: 0.31
Nodes (12): createAutoApplyDedupeKey(), createAutoApplyExactDuplicateKey(), dedupeJobs(), includesNormalized(), isPlaceholderCompany(), normalize(), PLACEHOLDER_COMPANIES, RankableJob (+4 more)

### Community 50 - "normalizeInline"
Cohesion: 0.31
Nodes (13): buildContactLine(), compactSkillsFallback(), compactSummaryFallback(), compactWords(), drawCentered(), drawHeaderClassic(), drawHeaderLeft(), drawRule() (+5 more)

### Community 51 - "resume/page.tsx"
Cohesion: 0.18
Nodes (9): Experience, Profile, Project, STYLE_OPTIONS, StyleId, AICoachingInput(), AICoachingInputProps, BASE_PATH (+1 more)

### Community 52 - "Reveal.tsx"
Cohesion: 0.23
Nodes (9): framer-motion, pillars, stats, ease, Reveal(), RevealProps, StaggerGroup(), StaggerItem() (+1 more)

### Community 53 - "ResumePage"
Cohesion: 0.27
Nodes (6): ResumePage(), handleQuestionSubmit(), moveToNextContentItem(), parseStylingPreferences(), requestResumePreview(), startContentQuestions()

### Community 54 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, dev, lint, start, test:ai, test:search, test:unit (+1 more)

### Community 55 - "SourceRail.tsx"
Cohesion: 0.33
Nodes (8): isAutomaticRetry(), sourceVisualClass(), sourceVisualLabel(), sourceVisualStatus, formatElapsed(), SourceRail(), SourceRailProps, SourceProgressState

### Community 56 - "User.ts"
Cohesion: 0.22
Nodes (8): Experience, ExperienceSchema, Profile, ProfileSchema, Project, ProjectSchema, User, UserSchema

### Community 57 - "clarifications-ui.test.ts"
Cohesion: 0.25
Nodes (5): ClarificationQuestions, { createElement }, html, questions, { renderToString }

### Community 58 - "rewriteTextSection"
Cohesion: 0.29
Nodes (8): cleanString(), getTextSectionExploreContext(), hasTextSectionExploreEvidence(), mergeImportedProfile(), copyTextSection(), getTextSectionContent(), rewriteTextSection(), up()

### Community 59 - "Career evaluation pipeline (backward compatibility)"
Cohesion: 0.33
Nodes (5): Career evaluation pipeline (backward compatibility), Field map, Heatmap policy, Migration (re-score), Motivation vs Logic

### Community 60 - "eslint.config.mjs"
Cohesion: 0.33
Nodes (5): compat, __dirname, eslintConfig, __filename, @eslint/eslintrc

### Community 61 - "save-answer/route.ts"
Cohesion: 0.40
Nodes (5): dynamic, POST(), runtime, saveAutoApplyMemory(), saveAnswerSchema

### Community 62 - "save"
Cohesion: 0.33
Nodes (5): save(), stripClientIds(), broadcastProfileUpdated(), PROFILE_UPDATED_EVENT, PROFILE_UPDATED_STORAGE_KEY

### Community 63 - "SearchSource"
Cohesion: 0.40
Nodes (5): chipClass(), PlatformPicker(), PlatformPickerProps, SEARCH_SOURCES, SearchSource

### Community 64 - "vercel.json"
Cohesion: 0.33
Nodes (5): buildCommand, devCommand, framework, installCommand, outputDirectory

### Community 65 - "SOURCE_LABELS"
Cohesion: 0.50
Nodes (4): formatDuplicateLabel(), ResultCard(), ResultCardProps, SOURCE_LABELS

### Community 67 - "LoginPage"
Cohesion: 1.00
Nodes (3): LoginPage(), handleSubmit(), redirectToAuthenticatedApp()

## Knowledge Gaps
- **466 isolated node(s):** `__filename`, `__dirname`, `compat`, `eslintConfig`, `configuredBasePath` (+461 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 522 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `buildApiUrl()` connect `buildApiUrl` to `generate/page.tsx`, `ProfilePage`, `ExperienceLocationInjector.tsx`, `control-room/page.tsx`, `GeneratePage`, `profile/page.tsx`, `search/page.tsx`, `resume/page.tsx`, `ResumePage`, `rewriteTextSection`, `auto-apply/page.tsx`, `Navbar.tsx`, `save`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `labels.ts`, `generate/page.tsx`, `search/types.ts`, `ExperienceLocationInjector.tsx`, `control-room/page.tsx`, `search/page.tsx`, `profile/page.tsx`, `resume/page.tsx`, `Reveal.tsx`, `auto-apply/page.tsx`, `Navbar.tsx`, `package.json`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `getAuthFromCookies()` connect `getAuthFromCookies` to `career/run-tests.ts`, `profile/route.ts`, `stream/route.ts`, `context.ts`, `generateJsonSafe`, `control-room.ts`, `connectToDatabase`, `workflow.ts`, `text-section-prompts.ts`, `pdf/route.ts`, `auth.ts`, `routes.ts`, `clarifications.test.ts`, `requireAutoApplyAuth`, `cover-letter.ts`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **What connects `__filename`, `__dirname`, `compat` to the rest of the system?**
  _466 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `sources.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05362517099863201 - nodes in this community are weakly interconnected._
- **Should `career/run-tests.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06428988895382817 - nodes in this community are weakly interconnected._
- **Should `profile/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09071117561683599 - nodes in this community are weakly interconnected._