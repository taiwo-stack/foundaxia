# FoundaXia (Academy)

FoundaXia is an elite one-on-one virtual learning and Academy management platform designed for K-12 students. It bridges the gap between students, parents, tutors, and administrators by offering real-time course scheduling, comprehensive Learning Management System (LMS) dashboards, interactive grading, direct parent-tutor messaging, and a high-fidelity collaborative virtual whiteboard classroom equipped with WebRTC voice/video calling capabilities.

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Directory Structure](#directory-structure)
3. [Key Modules & Dashboards](#key-modules--dashboards)
   - [Landing Page & Public Website](#landing-page--public-website)
   - [Student Dashboard](#student-dashboard)
   - [Tutor Dashboard](#tutor-dashboard)
   - [Admin Control Panel](#admin-control-panel)
   - [Collaborative Whiteboard Classroom](#collaborative-whiteboard-classroom)
4. [Technical Architecture & State Management](#technical-architecture--state-management)
   - [Frontend & Styling System](#frontend--styling-system)
   - [Dual-Layer Service Layer (Mock/Production Failover)](#dual-layer-service-layer-mockproduction-failover)
   - [WebRTC & Media Calling Infrastructure](#webrtc--media-calling-infrastructure)
   - [Real-Time Workspace Sync via Supabase Channels](#real-time-workspace-sync-via-supabase-channels)
5. [Database Schema & Migrations](#database-schema--migrations)
6. [Getting Started & Local Installation](#getting-started--local-installation)

---

## Project Overview
FoundaXia supports four distinct user categories:
- **Guests/Visitors**: Browse subjects, evaluate tutor profiles, submit learning inquiries, and book trial classes.
- **Students (and Parents)**: Track schedules, study topic-specific lessons, submit homework, solve interactive quizzes, communicate directly with tutors, and join interactive virtual classes.
- **Tutors**: Build schedules, host WebRTC sessions, grade student tasks, construct interactive quizzes, and upload learning files.
- **Administrators**: Control student registrations, manage tutor onboarding, oversee billing bookings, manage courses/topics, and audit communication channels via the built-in Chat Monitor.

---

## Directory Structure

A layout of the codebase and assets:

```
foundaxia/
├── public/                     # Static assets (images, logos, favicon, etc.)
│   ├── images/                 # Banner designs, subject booklets, logo files
│   └── _redirects              # Routing config for SPAs (SPA routing fallback)
├── src/                        # Main React application source code
│   ├── components/             # Reusable UI layout elements
│   │   ├── Header.jsx          # Dynamic navigation bar with dropdown filters
│   │   ├── Footer.jsx          # Public branding footer component
│   │   └── ProtectedRoute.jsx  # Role-based route guard and room-bypass authorization
│   ├── pages/                  # Top-level screen components
│   │   ├── LandingPage.jsx     # High-impact home page with booking and screening forms
│   │   ├── SubjectsPage.jsx    # Categorized course explorer with text filters
│   │   ├── Login.jsx           # Portal sign-in panel with dynamic redirection
│   │   ├── StudentDashboard.jsx# Student homework, quizzes, messages, and schedules
│   │   ├── TutorDashboard.jsx  # Schedule creator, grading desk, quiz builder
│   │   ├── AdminDashboard.jsx  # Registry controls, course builders, chat monitoring
│   │   └── Whiteboard.jsx      # High-fidelity real-time workspace with WebRTC
│   ├── services/               # Data adapters
│   │   └── dataService.js      # Hybrid client managing Supabase & LocalStorage modes
│   ├── styles/                 # Theme-driven CSS styling
│   │   ├── global.css          # Design tokens, background gradients, typography
│   │   ├── LandingPage.css     # Home section designs, approach timelines, sliders
│   │   ├── Login.css           # Center-card panel alignments and error tags
│   │   ├── Dashboard.css       # Sidebar structures, cards, custom modals
│   │   └── Whiteboard.css      # Floating toolbars, slide grids, video feeds
│   ├── App.jsx                 # Routing wrapper, logout handler, layout control
│   ├── main.jsx                # React DOM render mount point
│   └── supabaseClient.js       # Supabase client instantiation and feature flag checks
├── .env.local                  # Environment credentials configuration (Supabase keys)
├── package.json                # Project dependencies and script declarations
├── vite.config.js              # Vite build setup (React compiler plugin)
└── *.sql                       # Postgres database schema migrations and seed scripts
```

---

## Key Modules & Dashboards

### Landing Page & Public Website
- **Hero & Background Carousel**: Cycles through premium hero images with smooth opacity transitions.
- **Testimonial Slider**: Reviews from parents detailing tutoring success stories.
- **Interactive Screening Quiz**: A multi-step questionnaire that guides parents to declare their child's grade, struggle areas, and goals, which compiles a booking request.
- **FAQ Explorer**: Expanding FAQ cards supporting quick keyword searches.
- **Booking & Registration Forms**: time zone-configured schedulers for trial bookings.

### Student Dashboard
- **Schedule Tracker**: Lists upcoming live classes with single-click links to join virtual classrooms.
- **Course Syllabus Hub**: Displays active enrollments; selecting a course lists its topics and attached study materials (PDF sheets, diagrams).
- **Homework Submission Portal**: Students upload files or input text responses to complete homework assignments.
- **Interactive Quiz Player**: A multiple-choice exam interface. Displays correct answers, tallies scores, and records grading logs dynamically.
- **Direct Chat Rooms**: Private instant messaging lines with tutors.

### Tutor Dashboard
- **Class Planner**: Set slots for courses, create virtual classrooms, and input external Google Meet fallback URLs.
- **Attendance Logger**: Mark student attendance statuses (*Present, Absent, Late*) for past classes.
- **Assignment & Quiz Builder**: Construct assignments or design complex multiple-choice tests (with options mapping and correct answer pointers). Can be targeted to specific students or classes.
- **Grading Desk**: Displays pending student submissions, allows score submission (max points check), and provides feedback.
- **Syllabus Curator**: Upload documents/images to topics and organize class curriculum details.

### Admin Control Panel
- **Student Admissions Board**: Admins review incoming leads, approve registrations, activate student accounts with credentials, and assign tutoring schedules.
- **Tutor Roster Desk**: Onboard new tutors, specify rate cards, subjects, experience metrics, and edit profiles.
- **LMS Coordinator**: Manage standard categories (e.g., Coding, Math), compile courses, edit topics, and map tutor-student course enrollments.
- **Communications Monitor**: Centralized chat auditor allowing administrators to choose any tutor and student combination to review messaging history.

### Collaborative Whiteboard Classroom
A collaborative environment that includes:
- **Interactive Toolset**: Pen, Eraser, Highlighter, Selection Tool, Laser Pointer (with fading light trails), and geometric shapes (Rectangle, Circle, Lines, Arrows).
- **Stylus Integrations**: Supports pressure sensitivity.
- **Page Manager**: Create multiple canvas slides, switch between pages, and use undo/redo stacks.
- **Board Configurations**: Light/Dark canvas themes and backgrounds (dots, gridlines, graphs, blank).
- **File Imports**: Upload and render images directly onto the canvas.
- **Canvas Exports**: Save the entire whiteboard canvas as a PNG image file.
- **Draw Access Controls**: Host-level locks to toggles student canvas editing privileges.

---

## Technical Architecture & State Management

### Frontend & Styling System
- **Framework**: React 19 and React Router DOM v7 (SPA routing wrapper).
- **Design Language**: Custom styling built with native CSS custom properties (`global.css`). 
- **Typography & Aesthetics**: Utilizes premium Google Fonts (`Poppins` for headings, `Outfit` for body text) paired with dark glassmorphism effects, dynamic shadows, and glowing border gradients.
- **Icons**: SVG-based iconography sourced from `lucide-react`.

### Dual-Layer Service Layer (Mock/Production Failover)
The platform is designed to operate seamlessly with or without an active cloud database. The data layer in `dataService.js` performs a startup checks on environment configurations:

```
[Start App] ──> [Check env variables in supabaseClient.js]
                     │
                     ├──> Config Found? ──> [Production Mode] ──> Connect to Supabase
                     │                                            (Authentication & Database)
                     │
                     └──> Config Missing? ──> [Mock Mode] ──> Fallback to local storage
                                                             (Initializes Mock Data sets)
```

- **Production Mode**: Calls the `@supabase/supabase-js` client to fetch/mutate tables and manage session authentication.
- **Mock Mode**: Automatically loads pre-seeded JSON datasets (covering mock users, tutors, courses, schedules, and whiteboard pages) and persists all additions or modifications directly to the user's `localStorage` and `sessionStorage`.

### WebRTC & Media Calling Infrastructure
The virtual whiteboard implements a full-mesh WebRTC calling client built on top of browser media APIs:
- **Signaling Channel**: Supabase Realtime client broadcast event loops are used to transmit connection handshakes (*SDP Offers*, *SDP Answers*, and *ICE candidates*).
- **ICE Queues**: Queues ICE candidates if candidates are received before the local connection configuration description (`setRemoteDescription`) has finished parsing.
- **Media streams**: Captures camera frames (`getUserMedia`) and maps them to floating CSS grids.
- **Audio RMS analysis**: Employs an `AudioContext` and `AnalyserNode` frequency spectrum loop to determine real-time speech intensities, lighting up avatar rings when a participant speaks.

### Real-Time Workspace Sync via Supabase Channels
Collaboration on the whiteboard syncs coordinates and drawings using real-time channels:
- **Drawings Broadcast**: Mouse/Stylus movement paths are broadcasted as lightweight packets across a broadcast channel.
- **Collaborator Cursors**: Emits absolute canvas pointer positions to display moving cursor badges for all active room participants.
- **Page Syncing**: The Host transmits state updates to align the slide index and draw configurations of guest screens.

---

## Database Schema & Migrations

If connected to Supabase, the database structure comprises:

| Table Name | Description | Key Relationships / Fields |
|---|---|---|
| `profiles` | User accounts with roles | Linked to auth users (`id`). Contains `role` (*student, tutor, admin*), `full_name`. |
| `students` | Detailed K-12 learner profile | Contains emergency contacts, parent details, grade level, and program type. |
| `tutors` | Tutor profile descriptions | Holds subject expertise, bio summaries, ratings, and rates. |
| `bookings` | Booking inquiries | Tracks booking date, time slots, zone settings, meeting type, and status. |
| `contact_messages` | Landing page contact forms | Name, email, subject, text message. |
| `course_categories` | Curriculum groupings | Standard divisions (Math, coding, etc.). |
| `courses` | Subject rosters | Title, descriptions, target tags, banner image URLs. |
| `topics` | Syllabus topics | Parent course mapping (`course_id`), sort order titles. |
| `materials` | Lesson file references | Associated topic (`topic_id`), cloud storage file URLs, file types. |
| `student_courses` | Enrollment directory | Maps students to courses and assigned tutors. |
| `tasks` | Homework or exams definitions | Contains parameters like quiz questions JSON or assignment descriptions. |
| `student_tasks` | Homework submissions | Student answers, file upload links, scores, and tutor feedback. |
| `schedules` | Live classroom events | Link coordinates, scheduled dates, and meeting links. |
| `attendance` | Classroom attendance logs | Linked schedule ID, student status (*Present/Absent/Late*), and notes. |
| `chat_messages` | Platform chat messages | Sender information, text content, and timestamps. |

The root of the directory contains the SQL files for setting up the tables, indexing, and seed data:
- `add_categories_and_booking_fields.sql`: Initializes categories, seeds the primary courses registry, and updates student profile schemas.
- `add_course_image.sql`: Appends the `image_url` column to course references.
- `add_missing_task_columns.sql`: Configures task publishing options and student-specific assignments capability.

---

## Getting Started & Local Installation

### Prerequisites
- Node.js (v18 or higher recommended)
- NPM package manager

### Installation Steps

1. **Clone the repository and enter the directory**:
   ```bash
   git clone https://github.com/taiwo-stack/foundaxia.git
   cd foundaxia
   ```

2. **Install project dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   To run in production mode with Supabase, create a `.env.local` file in the project root and add the credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```
   *If `.env.local` is omitted, the application will automatically start in **Mock Mode** using local storage data.*

4. **Launch the Local Development Server**:
   ```bash
   npm run dev
   ```
   Open your browser and navigate to the address shown in the terminal (typically `http://localhost:5173`).

5. **Build and Preview Production Bundle**:
   Verify bundle creation before shipping to hosts:
   ```bash
   npm run build
   ```
   Preview the compiled build locally:
   ```bash
   npm run preview
   ```
