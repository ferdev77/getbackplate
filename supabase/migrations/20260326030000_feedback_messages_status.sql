ALTER TABLE public.feedback_messages
ADD COLUMN status text NOT NULL DEFAULT 'open',
ADD COLUMN resolved_at timestamptz;

-- Constraint to ensure valid status
ALTER TABLE public.feedback_messages
ADD CONSTRAINT feedback_messages_status_check 
CHECK (status IN ('open', 'read', 'resolved'));
