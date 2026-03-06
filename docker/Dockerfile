FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git jq curl && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare yarn@4.13.0 --activate

# Real CLI agents
RUN npm install -g @anthropic-ai/claude-code && mkdir -p /root/.claude
RUN npm install -g @google/gemini-cli && mkdir -p /root/.gemini
RUN npm install -g @openai/codex && mkdir -p /root/.codex

# Mock directories for GUI-only agents
RUN mkdir -p /root/.cursor /root/.codeium/windsurf /root/.vscode \
    /root/.kiro /root/.cline /root/.continue /root/.roo \
    /root/.kilocode /root/.gemini/antigravity /root/.config/opencode \
    /root/.config/Claude

WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
RUN yarn install --immutable
COPY . .
RUN yarn build

# Keep container running for exec-based tests
CMD ["sleep", "infinity"]
