# Plan Well - Teen Goal and Habit Tracker

Plan Well is a personal productivity and progress-tracking website designed for teenagers. It helps users set their own goals, break those goals into micro steps, connect real-life routines to daily habits, capture one-off tasks, and track progress over time through a futuristic 3D dashboard interface.

The app starts with no fake goals, habits, or tasks. Everything shown in the dashboard is based on what the signed-in user adds.

## Live Website

Visit the live version here:

[Plan Well - Teen Goal and Habit Tracker](https://planwellforyourteenlife.netlify.app/)

## Features

- Account-based login and signup with Supabase Auth
- Google login, email/password login, and magic link login
- Per-user cloud saving for goals, habits, tasks, categories, reflections, and XP state
- 3D dashboard summary for goals, habits, and rewards
- Custom goal creation with categories, deadlines, and micro steps
- Micro steps with optional daily routine ideas
- Daily habit checklist based on the current date
- Recent-day habit editing for today and the previous six days
- Reflection box for missed habits
- Task board for one-off work that should not become a full habit or goal
- Customizable life-area categories
- XP and reward progress summary
- Internal confirmation messages before deleting goals, habits, or categories

## Pages

- `index.html` - Main dashboard and compact workspaces
- `goals.html` - Full goal-planning page
- `habits.html` - Full habit-tracking page
- `tasks.html` - Full task board page
- `rewards.html` - Rewards and XP overview

## Supabase Backend Setup

Plan Well uses Supabase as the v1 backend. Supabase handles authentication, Google OAuth, email/password login, magic links, hosted Postgres storage, and row-level security.

1. Create a Supabase project.
2. In Supabase, open the SQL editor and run `supabase/schema.sql`.
3. Enable Email auth in Supabase Auth.
4. Enable Google OAuth in Supabase Auth and add the local and production redirect URLs.
5. Copy your project URL and anon key into `supabase-config.js`.
6. Deploy the updated static site.

The app stores one JSON document per user in `public.user_tracker_states`. Row-level security ensures users can only read and update their own saved tracker data.

## Current Status

This is an early functional prototype with account-based persistence ready for Supabase configuration. The main goal is to test the user flow, data logic, and visual direction before polishing the final interface.

Future improvements may include a fuller reward editor, long-term analytics, and more detailed progress insights.
