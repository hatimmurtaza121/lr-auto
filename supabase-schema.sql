-- Drop tables if they exist (in dependency order)
DROP TABLE IF EXISTS captcha_log CASCADE;
DROP TABLE IF EXISTS session     CASCADE;
DROP TABLE IF EXISTS game        CASCADE;
DROP TABLE IF EXISTS team        CASCADE;

-- 1) team
CREATE TABLE team (
  id          SERIAL       PRIMARY KEY,      -- auto-incrementing ID
  code        TEXT         NOT NULL UNIQUE,  -- e.g. 'ent1', 'ent2'
  name        TEXT         NOT NULL,         -- human-readable name
  created_at  TIMESTAMPTZ  DEFAULT now()
);

-- 2) game
CREATE TABLE game (
  id          SERIAL       PRIMARY KEY,      -- auto-incrementing ID
  team_id     INTEGER      NOT NULL          REFERENCES team(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,         -- human-readable game name
  username    TEXT         NOT NULL,         -- login username for this game
  password    TEXT         NOT NULL,         -- login password for this game
  login_url   TEXT         NOT NULL,         -- URL for login page
  created_at  TIMESTAMPTZ  DEFAULT now()
);

-- 3) session
CREATE TABLE session (
  id             SERIAL       PRIMARY KEY,   -- auto-incrementing ID
  user_id        UUID         NOT NULL       REFERENCES auth.users(id),
  game_id        INTEGER      NOT NULL       REFERENCES game(id) ON DELETE CASCADE,
  credentials    JSONB        NOT NULL,      -- e.g. { "username": "...", "password": "..." }
  session_token  TEXT         NOT NULL,      -- in-memory/session token
  session_data   JSONB        DEFAULT '{}'::JSONB, -- Playwright storage state (cookies only)
  expires_at     TIMESTAMPTZ,                -- when the session expires (from cookies)
  is_active      BOOLEAN      DEFAULT TRUE,
  created_at     TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX ON session(user_id);
CREATE INDEX ON session(game_id);
CREATE INDEX ON session(is_active);

-- 4) captcha_log
CREATE TABLE captcha_log (
  id           SERIAL       PRIMARY KEY,     -- auto-incrementing ID
  image_path   TEXT         NOT NULL,        -- storage key or URL of CAPTCHA image
  api_response TEXT,                         -- what Gemini returned (nullable)
  api_status   TEXT         NOT NULL DEFAULT 'fail'
                                        CHECK (api_status IN ('success','fail')),
  solved_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
