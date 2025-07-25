-- Drop tables if they exist (in dependency order)
DROP TABLE IF EXISTS captcha_log      CASCADE;
DROP TABLE IF EXISTS session          CASCADE;
DROP TABLE IF EXISTS game_credential  CASCADE;
DROP TABLE IF EXISTS game             CASCADE;
DROP TABLE IF EXISTS team             CASCADE;

-- 1) team
CREATE TABLE team (
  id          SERIAL       PRIMARY KEY,
  code        TEXT         NOT NULL UNIQUE,
  name        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  DEFAULT now()
);

-- 2) game
CREATE TABLE game (
  id            SERIAL       PRIMARY KEY,
  name          TEXT         NOT NULL,      -- e.g. 'BattleQuest'
  login_url     TEXT         NOT NULL,      -- e.g. 'https://…'
  dashboard_url TEXT,                       -- e.g. 'https://…' (optional, defaults to login_url)
  created_at    TIMESTAMPTZ  DEFAULT now()
);

-- 3) game_credential
-- each row now ties a team to a game plus its creds
CREATE TABLE game_credential (
  id          SERIAL       PRIMARY KEY,
  team_id     INTEGER      NOT NULL
               REFERENCES team(id)
               ON DELETE CASCADE,
  game_id     INTEGER      NOT NULL
               REFERENCES game(id)
               ON DELETE CASCADE,
  username    TEXT         NOT NULL,
  password    TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  DEFAULT now()
);

-- 4) session
-- unchanged except point at the credential
CREATE TABLE session (
  id                   SERIAL       PRIMARY KEY,
  user_id              UUID         NOT NULL
                         REFERENCES auth.users(id),
  game_credential_id   INTEGER      NOT NULL
                         REFERENCES game_credential(id)
                         ON DELETE CASCADE,
  session_token        TEXT         NOT NULL,
  session_data         JSONB        DEFAULT '{}'::JSONB,
  expires_at           TIMESTAMPTZ,
  is_active            BOOLEAN      DEFAULT TRUE,
  created_at           TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX ON session(user_id);
CREATE INDEX ON session(game_credential_id);
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


INSERT INTO public.team (code, name) VALUES
  ('ent1', 'Big Money Gaming Support'),
  ('ent2', 'Highstakes Gaming Support'),
  ('ent3', 'Power house'),
  ('ent4', 'Crown Gaming'),
  ('ent8', 'Overdrive Gaming');

INSERT INTO public.game (name, login_url) VALUES
  ('Yolo', 'https://agent.yolo777.game/'),
  ('Orion Stars', 'https://orionstars.vip:8781/default.aspx'),
  ('Game Vault', 'https://agent.gamevault999.com/login'),
  ('Orion Strike', 'https://www.orionstrike777.com/admin/login'),
  ('Mr All In One', 'https://agentserver.mrallinone777.com/'),
  ('Juwa City', 'https://ht.juwa777.com/login');
