# Terminal Configuration & Dispatch Hub - Product Requirements Document

A comprehensive team management platform for Nexi Group that provides centralized access to shift scheduling, vacation planning, team directory, internal communications, meal planning, project management, and game breaks - all with multi-language support and role-based access control.

**Experience Qualities**: 
1. **Cohesive** - All modules feel like parts of a unified system with consistent design patterns, shared components, and standardized interactions
2. **Professional** - Modern SaaS-grade interface with polished animations, proper loading states, and attention to detail throughout
3. **Efficient** - Streamlined workflows that reduce clicks and cognitive load, with smart defaults and bulk operations where appropriate

**Complexity Level**: Complex Application (advanced functionality with multiple interconnected modules and views)

This is a full-featured team management hub with 11 active modules spanning HR, operations, communications, and team culture. Features comprehensive user authentication with session management, role-based access control (admin/manager/employee), real-time data synchronization, internationalization (Danish/English), theme switching (light/dark), and persistent data storage. The application architecture is built on reusable components, custom data hooks, and a centralized design system for maintainability and consistency.

## Active Modules

### 1. Shift Schedule (Vagtplan)
Complete shift management system with roles, assignments, and daily planning. Supports individual and bulk scheduling, role color coding, comments per assignment, and integrates with sick leave and vacation data for conflict detection.

### 2. Vacation Calendar (Feriekalender)
Team vacation planning with approval workflow. Employees request time off (single days or ranges), managers approve/reject, and the calendar shows visual overlaps and availability conflicts.

### 3. Team Overview (Team Oversigt)
Employee directory with profiles, contact information, roles, and avatars. Supports adding, editing, and viewing team member details with responsive cards and search functionality.

### 4. Email System
Internal messaging platform with inbox, sent items, folders, and compose features. Supports threaded conversations, read/unread states, starring, and folder organization.

### 5. Guide Library (Guide Bibliotek)
Knowledge base with CRUD operations, category filtering, search, Word document uploads, and an AI chatbot assistant that can answer questions about stored guides.

### 6. Meal Plan (Madplan)
Weekly cafeteria menu display showing meals for each weekday. View current week's offerings with day-by-day breakdown.

### 7. Project Board (Projekter)
Task and project management with kanban-style boards, task assignments, status tracking, and team collaboration features.

### 8. Game Corner (Spil Hjørnet)
Leisure module for team breaks and morale. Currently placeholder for future games integration.

### 9. Manager Panel
Administrative dashboard for managers and admins. Displays statistics on sick leave (both employee and child sick days), vacation requests pending approval, shift coverage, and team metrics. Provides approval/rejection workflows.

### 10. Admin Panel
System administration for user management, role assignments, and application configuration. Restricted to admin users only.

### 11. Hub Dashboard
Central overview showing today's tasks, people off, today's meal, and sick employees. Quick access cards to all modules with unread email counts and real-time data updates.

## Essential Features

### User Authentication
- **Functionality**: Login and signup system that protects access to the hub. Users create accounts with email, password, and full name. Session persists between page refreshes.
- **Purpose**: Ensures each user has their own secure account and personalized experience
- **Trigger**: Application loads, user sees authentication screen if not logged in
- **Progression**: Load app → See login/signup form → Enter credentials → Authenticate → Access hub with personalized profile
- **Success criteria**: User can create account, login, stay logged in across refreshes, and logout when desired. Clear error messages for invalid credentials or duplicate accounts.

### User Profile & Logout
- **Functionality**: Dropdown menu in top-right showing user email with logout option
- **Purpose**: Provides quick access to account info and ability to sign out
- **Trigger**: Click on user profile button in any view
- **Progression**: Click profile → Dropdown opens → View email → Click logout → Return to login screen
- **Success criteria**: Profile is always visible and accessible, logout clears session and returns to auth screen

### Hub Navigation
- **Functionality**: Central dashboard displaying all available team modules as cards with visual indicators for which modules are active
- **Purpose**: Provides single entry point to all team resources and tools
- **Trigger**: Application loads to hub view by default, back button from any module returns to hub
- **Progression**: Load app → See hub with module cards → Click available module → Navigate to that module → Use back button → Return to hub
- **Success criteria**: Hub loads quickly, module cards are visually distinct, navigation is smooth, clear indication of which modules are available vs coming soon

### Guide Management
- **Functionality**: Create, edit, and delete department guides with title, category, content, and tags. Supports Word document uploads (.docx files) stored persistently
- **Purpose**: Allows team members to build and maintain a living knowledge base
- **Trigger**: Navigate to Guide Library from hub, then click "Add Guide" button or edit icon on existing guide
- **Progression**: Open hub → Click Guide Library → Click add button → Dialog opens with form → Fill in title, category, content, tags, optionally upload Word doc → Save → Guide appears in library → Success toast
- **Success criteria**: Guides persist between sessions, all fields save correctly, Word documents are stored and downloadable, guides can be edited and deleted

### Category Organization
- **Functionality**: Filter guides by predefined categories (Procedures, Technical, HR, Safety, General)
- **Purpose**: Enables quick browsing of related guides without search
- **Trigger**: Click category filter button or "All" to see everything
- **Progression**: Click category → List filters instantly → See only relevant guides → Click another category or "All" to change view
- **Success criteria**: Filter is instant, shows accurate count, clearly indicates active filter

### Search Functionality
- **Functionality**: Real-time text search across guide titles, content, and tags
- **Purpose**: Allows users to quickly narrow down guides using keywords
- **Trigger**: Type in search input field
- **Progression**: Type keyword → Results filter in real-time → See matching guides highlighted → Clear search to reset
- **Success criteria**: Search is instant, case-insensitive, searches all relevant fields

### AI Chatbot Assistant
- **Functionality**: Conversational AI that can search guides, provide direct answers, and help solve problems
- **Purpose**: Provides intelligent assistance when users don't know exactly which guide they need
- **Trigger**: Click chat button to open sidebar, type question
- **Progression**: Click chat icon → Sidebar opens → Type question → AI responds with relevant guide references or direct help → Follow-up questions possible → Close sidebar when done
- **Success criteria**: AI can reference specific guides, provide contextual answers, and help users find solutions even with vague queries

### Guide Detail View
- **Functionality**: Full-screen viewer that displays Word document content with proper formatting or provides download option for uploaded files
- **Purpose**: Allows users to view complete guide content without leaving the application
- **Trigger**: Click on guide card in Guide Library
- **Progression**: Click card → Viewer dialog opens → View formatted content or download file → Close with ESC or X button
- **Success criteria**: Smooth dialog animation, content is properly formatted and readable, download works correctly, easy to close

### Category Management
- **Functionality**: Admin interface to create, edit, and delete guide categories (except "General" which is fixed)
- **Purpose**: Allows customization of organizational structure for guides
- **Trigger**: Click settings/gear icon in Guide Library header
- **Progression**: Click gear → Category manager opens → Add/edit/delete categories → Save changes → Categories update across app
- **Success criteria**: Changes persist, guides maintain their categories, "General" category cannot be removed

## Edge Case Handling

- **Empty Hub State**: Show welcoming hub interface with all module cards, clearly indicating which are active vs coming soon
- **Module Navigation**: Preserve state when navigating between hub and modules (guides don't reload unnecessarily)
- **Empty Guide Library**: Show friendly illustration and call-to-action when no guides exist yet in the Guide Library module
- **No Search Results**: Display "No guides found" message with suggestion to try different keywords or add a new guide
- **Long Content**: Guide content should scroll within viewer dialog with proper text formatting
- **Duplicate Categories**: Prevent users from creating guides without selecting a category
- **Network Delays**: Show loading state while AI is thinking in chat assistant, prevent multiple simultaneous chat requests
- **Very Long Guide Titles**: Truncate with ellipsis in card view, show full title in viewer
- **Browser Back Button**: Keep navigation in sync with browser history where appropriate

## Design Direction

The design should evoke feelings of **organization, professionalism, and teamwork**. The hub interface should feel like a well-designed workspace portal - modern and inviting, with clear visual hierarchy that makes navigation intuitive. Individual modules like the Guide Library should maintain consistent design language while having their own focused personality. The overall experience should reduce cognitive load through clear information architecture and familiar interaction patterns.

## Color Selection

A modern, vibrant color scheme that creates energy and visual interest through bold purples, teals, and pinks. The palette conveys innovation, creativity, and approachability with a contemporary digital aesthetic.

- **Primary Color**: Vibrant purple `oklch(0.55 0.22 265)` - Conveys creativity, innovation, and intelligence. Used for primary actions and key UI elements with gradient overlays.
- **Secondary Color**: Cool teal `oklch(0.72 0.18 195)` - Modern and refreshing, provides balance to the purple primary and creates harmonious gradients.
- **Accent Color**: Energetic pink `oklch(0.70 0.20 340)` - Eye-catching and playful for the AI chatbot, CTAs, and interactive moments that need attention.
- **Background**: Very light gray with subtle purple tint `oklch(0.98 0.005 280)` - Clean, modern canvas that doesn't compete with content.
- **Foreground/Background Pairings**:
  - Primary purple (oklch(0.55 0.22 265)): White text (oklch(0.99 0 0)) - Ratio 8.2:1 ✓
  - Secondary teal (oklch(0.72 0.18 195)): White text (oklch(0.99 0 0)) - Ratio 5.1:1 ✓
  - Accent pink (oklch(0.70 0.20 340)): White text (oklch(0.99 0 0)) - Ratio 4.9:1 ✓
  - Background (oklch(0.98 0.005 280)): Dark foreground (oklch(0.15 0.02 260)) - Ratio 15.8:1 ✓

## Font Selection

Typography should convey **modernity and clarity** with a friendly, approachable character. Use **Plus Jakarta Sans** for body text and UI elements for its geometric warmth and excellent readability, paired with **Outfit** for headings to add personality and impact.

- **Typographic Hierarchy**:
  - H1 (App Title): Outfit Bold/32-48px/tight letter-spacing with gradient overlay
  - H2 (Section Headers): Outfit SemiBold/24px/normal letter-spacing  
  - H3 (Guide Titles): Outfit SemiBold/18-20px/normal letter-spacing
  - Body (Guide Content): Plus Jakarta Sans Regular/15px/relaxed line-height (1.6)
  - UI Labels: Plus Jakarta Sans Medium/14px/normal letter-spacing
  - Chat Messages: Plus Jakarta Sans Regular/14px/relaxed line-height (1.5)
  - Tags/Badges: Plus Jakarta Sans Bold/12px/normal letter-spacing

## Animations

Animations should enhance clarity and provide subtle feedback without creating distraction. Use smooth, natural transitions to maintain spatial relationships and guide attention.

- **Hub Entry**: Staggered fade-in (50ms delay between module cards) when hub loads for delightful first impression
- **Hub Logo**: Subtle pulsing glow animation on the main hub logo for visual interest
- **Module Card Hover**: Gentle scale (1.02) and shadow elevation on hover
- **View Transitions**: Smooth fade transition (300ms) when navigating between hub and modules
- **Card Expansion**: Smooth height animation (300ms) with ease-in-out when expanding guide details
- **Filter Changes**: Gentle fade (200ms) when guide list updates after filtering
- **Chatbot Entry**: Slide-in from right (350ms) with subtle backdrop fade for the AI sidebar
- **Button Interactions**: Subtle scale (0.98) on press for tactile feedback
- **Search Results**: Staggered fade-in (50ms delay between items) when results update
- **Success Actions**: Gentle bounce on toast notifications
- **Loading States**: Pulsing animation for AI thinking indicator
- **Back Button**: Subtle rotation on hover to reinforce navigation action

## Component Selection

- **Components**:
  - `Card` for both hub module cards and guide items with custom hover shadow effects
  - `Dialog` for guide creation/editing forms and guide viewer
  - `Button` with variants (default for primary actions, outline for secondary actions, ghost for tertiary)
  - `Input` and `Textarea` for form fields with focus ring in primary color
  - `Badge` for category tags, guide metadata, and "coming soon" indicators
  - `ScrollArea` for chat messages and long guide content
  - `Sheet` for the AI chatbot sidebar (right-side slide)
  - `Separator` for visual breaks between sections
  
- **Customizations**:
  - Custom hub module card component with gradient backgrounds and icon displays
  - Custom guide card component with expand/collapse state
  - Custom chat bubble components (user vs AI with different styling)
  - Custom empty state illustrations for both hub and guide library
  - Custom category filter chips with active state indicator
  - Custom back button with arrow icon
  
- **States**:
  - Module cards: Default has subtle shadow, hover shows scale and elevated shadow, disabled shows "coming soon" badge
  - Buttons: Default has solid primary background, hover adds subtle scale and brightness increase, active shows pressed state, disabled is muted with reduced opacity
  - Input fields: Default has subtle border, focus shows primary color ring and border, filled state shows slight background tint
  - Guide cards: Default has subtle shadow, hover elevates with increased shadow
  - Filter chips: Default is ghost, active shows solid background with primary color, hover shows slight background
  
- **Icon Selection**:
  - `Books` for Guide Library module and app branding
  - `Users` for team directory module (future)
  - `Calendar` for calendar module (future)
  - `ChartBar` for analytics module (future)
  - `FileText` for documents module (future)
  - `Folder` for projects module (future)
  - `ChatCircle` for team chat module (future) and chatbot toggle
  - `Gear` for settings module (future) and category management
  - `ArrowLeft` for back navigation
  - `Plus` for add new guide
  - `MagnifyingGlass` for search
  - `PencilSimple` for edit actions
  - `Trash` for delete
  - `Tag` for guide tags
  - `X` for close/clear actions
  - `Check` for success states
  
- **Spacing**:
  - Hub container padding: `p-12 sm:p-20` for spacious feel
  - Module card grid gaps: `gap-6` (24px)
  - Guide Library container padding: `p-8 sm:p-12` (32-48px)
  - Card gaps in guide grid: `gap-6` (24px) 
  - Form fields: `gap-4` (16px) vertical spacing
  - Section margins: `mb-8` to `mb-12` (32-48px) between major sections
  - Card internal padding: `p-8` (32px) for module cards, `p-5` (20px) for guide cards
  - Button padding: `px-4 py-2` for default size, `px-5 h-11` for toolbar buttons
  
- **Mobile**:
  - Hub: 1-2 column grid for module cards (4 columns on desktop)
  - Guide Library: Single column grid for guide cards (2-3 columns on desktop)
  - Chatbot changes from sidebar Sheet to full-screen Dialog on mobile
  - Category filters stack or use horizontal scroll with snap points
  - Search bar maintains position with responsive height
  - Touch targets minimum 44px for all interactive elements
  - Reduced padding for better screen utilization on mobile
  - Back button remains prominent and accessible
