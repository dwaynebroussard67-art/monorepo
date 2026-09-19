infra-up:
	cd infrastructure && docker compose up -d

portfolio-up:
	cd infrastructure && docker compose -f docker-compose.portfolio.yml up -d

zip:
	cd .. && zip -r killer-suite-complete.zip killer-suite
