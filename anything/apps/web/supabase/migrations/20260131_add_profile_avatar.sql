-- Migration to add avatar_url to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
-- Update RLS policies to allow users to update their own avatar_url if not already covered
-- Usually profiles has a policy: "Users can update their own profile";
