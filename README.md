# Plan Well - Mindful Goal Builder & Habit Tracker

Plan Well is a goal builder and habit tracker engineered to eliminate overwhelm, connect daily routines to long-term progress, and grow together with friends and family in a responsive 3D interface.

The application starts with zero pre-loaded bloat. Everything shown in the dashboard centers around the goals, habits, and tasks added by the user.

---

## Key Features

### Micro-Step Goal Builder
- Deconstruct large intimidating objectives into actionable 5-to-15 minute daily micro-steps.
- High-contrast Purpose & Motivation Cards displaying Why This Matters, Success Metrics, and Reward on Completion.

### Date-Smart Habit Tracker
- Schedule habits by specific weekdays (Mon-Sun) or custom daily schedules.
- Review and update habit completion for today and the previous 6 days.
- Guilt-free reflection log for missed routines to identify bottlenecks.
- Integrated 21-Day Habit Challenge tracker.

### Goal-Habit & Task Linking
- Connect daily habits directly to specific goal milestones so everyday actions compound into long-term achievement.
- Connect one-off tasks to habits or goals.

### Friends & Family Growth & Consistency
- Share habit streaks and compare consistency leaderboards with friends and family members to stay accountable together.

### User Account & Cloud Sync
- Google OAuth Sign-In and Email Authentication powered by Supabase.
- Multi-device automatic cloud synchronization for all user data.
- Active plan status badge displayed directly inside the user profile menu (Free Plan vs Plan Well Pro Active).

---

## Free Plan vs Plan Well Pro

### Free Plan Limits
- Up to 1 Active Goal
- Up to 3 Daily Habits
- Up to 3 Active Tasks
- Up to 3 Linked Micro Success Steps to Habits
- Past 7 Days History Log

### Plan Well Pro Benefits
- Unlimited Active Goals
- Unlimited Daily Habits and Tasks
- Unlimited Goal-Habit and Task Connections
- Multi-Device Google Account Cloud Sync
- Friends & Family Consistency Leaderboard
- Full 3D Streak Heatmaps & Historical Analytics

### Pricing Structure
- Monthly Plan: ₹199 / month
- Yearly Plan: ₹1,999 / year (Saves ₹389 / year)

---

## Repository Structure

- `index.html` - Main Web Application Dashboard
- `goals.html` - Micro-Step Goal Planner
- `habits.html` - Date-Smart Habit Tracker
- `tasks.html` - Actionable Task Board
- `rewards.html` - XP Progress & Leaderboard Overview
- `PlanWell-Marketing-Website/index.html` - 3D Marketing Landing Page
- `app.js` - Core Web Application State & Logic
- `styles.css` - Design System Tokens & Modern Styles
- `supabase/schema.sql` - Supabase Database Schema & Row Level Security Policies
- `server.ps1` - PowerShell Local Static Development Server

---

## Local Development Setup

To host and test the website locally:

```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1 -Port 8080
```

Access the local environments:
- Main Web Application: http://localhost:8080/index.html
- 3D Marketing Site: http://localhost:8080/PlanWell-Marketing-Website/index.html

---

## Backend & Supabase Configuration

Plan Well uses Supabase for authentication, Google OAuth, hosted PostgreSQL storage, and Row-Level Security (RLS).

1. Create a project at https://supabase.com
2. In the Supabase SQL Editor, execute `supabase/schema.sql`.
3. Enable Email & Google OAuth under Authentication -> Providers.
4. Set Site URL and Redirect URLs under Authentication -> URL Configuration.
5. Add Supabase URL and Anon Key to `supabase-config.js`.
