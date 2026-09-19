# top-level convenience targets; run from the repository root
REPO := $(notdir $(CURDIR))

install:
	pnpm install

typecheck:
	pnpm typecheck

smoke:
	pnpm test:smoke

infra-up:
	cd infrastructure && docker compose up -d

portfolio-up:
	cd infrastructure && docker compose -f docker-compose.portfolio.yml up -d

zip:
	cd .. && zip -r $(REPO)-complete.zip $(REPO) \
		-x "$(REPO)/.git/*" "$(REPO)/node_modules/*" "$(REPO)/*/node_modules/*" \
		   "$(REPO)/*/*/node_modules/*" "$(REPO)/.turbo/*"
	mv ../$(REPO)-complete.zip $(CURDIR)/$(REPO)-complete.zip
	sha256sum $(CURDIR)/$(REPO)-complete.zip

.PHONY: install typecheck smoke infra-up portfolio-up zip
