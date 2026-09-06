// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CONNECTION
// ═══════════════════════════════════════════════════════════════════════════
// The keys are here on purpose. Every phone that opens the app is connected the moment it
// loads — no setup screen, no link to forward, nothing to type on a keypad. The previous
// build expected each device to be connected by hand, which is why two devices were
// running side by side sharing nothing at all.
//
// The anon key is DESIGNED to sit inside the app. It is sent by every browser request and
// is not a secret. What protects the data is the rules on the server.
//
// ⚠ Those rules are not on yet. Until supabase-lockdown.sql is run, this key grants read
// and write on every table to anyone who has it. So: no public links, no group chats, and
// no real sales until the lockdown is in. It is one paste in the Supabase SQL editor.
//
// NEVER put the "service_role" key in this file. That one bypasses every rule.

window.SUPABASE_CONFIG = {
  url:     'https://lrbdipbzsyxalyxqzmxq.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyYmRpcGJ6c3l4YWx5eHF6bXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNTcwMDUsImV4cCI6MjA5ODkzMzAwNX0.pXhRK5B_WCFqQd2gctoX18liQDOsoNS4cy7hXdYEGeU'
};
