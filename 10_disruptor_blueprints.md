# 10 Disruptor Product Technical Blueprints

Date: 2026-06-06

> These are production-oriented technical blueprints, not legal opinions. Patentability depends on prior art, claim drafting, and jurisdiction. Securities, employment, privacy, and platform ToS issues should be reviewed with counsel before launch.

---

## 1) Kill Shopify — E-Commerce + Live Social Proof Engine

### 1. System Architecture & Tech Stack
- **Frontend:** Next.js + React Server Components, Tailwind, shadcn/ui, drag-and-drop builder via dnd-kit, storefront hydration via edge-rendered widgets.
- **Backend:** NestJS or Fastify for commerce APIs; dedicated realtime service in Go for high-fanout social proof and live stream state.
- **Databases:** PostgreSQL (catalog, orders, merchants), Redis (cart/session cache), ClickHouse (high-volume visitor events), S3-compatible object store (media/assets).
- **Event Streaming:** Kafka or Redpanda for visitor events, purchase events, and stream-state events.
- **Video/Realtime:** LiveKit or Agora for live shopping streams; WebSocket gateway for chat, viewer counts, product pinning.
- **Payments / Messaging:** Stripe, Resend/Postmark, Twilio.
- **ML/AI:** Simple fraud/anomaly scoring in Python; optional recommendation models in PyTorch/XGBoost.

### 2. Core Database Schema & Data Models
- `tenants(id, name, plan, billing_status)`
- `stores(id, tenant_id, domain, theme_json, settings_json)`
- `pages(id, store_id, page_type, layout_json)`
- `products(id, store_id, title, slug, status, metadata_json)`
- `variants(id, product_id, sku, price_cents, inventory_qty, attributes_json)`
- `customers(id, store_id, email, phone, profile_json)`
- `carts(id, store_id, customer_id, status, abandoned_at)`
- `cart_items(id, cart_id, variant_id, qty, unit_price)`
- `orders(id, store_id, customer_id, total_cents, payment_status, fulfillment_status)`
- `visitor_sessions(id, store_id, anon_id, geo_hash, started_at)`
- `visitor_events(id, session_id, type, product_id, occurred_at, metadata_json)`
- `social_proof_rules(id, store_id, rule_type, config_json)`
- `social_proof_events(id, store_id, product_id, message, confidence, expires_at)`
- `live_streams(id, store_id, host_id, status, started_at, ended_at)`
- `stream_viewers(id, stream_id, anon_id, joined_at, left_at)`
- `stream_products(id, stream_id, product_id, pinned_at, unpinned_at)`
- `stream_messages(id, stream_id, sender_type, sender_id, body, created_at)`
- `buy_now_tokens(id, stream_id, variant_id, customer_ref, expires_at, used_at)`

### 3. The Moat Feature Logic (Deep Dive)
```pseudo
on storefront_event(event):
  validate_signature(event.sdk_token)
  if anomaly_score(event) > threshold:
      discard or quarantine
  publish Kafka(topic='visitor_events', event)

social_proof_aggregator(window=1..24h):
  events = read stream by store_id/product_id
  aggregate metrics:
    active_viewers_5m
    unique_views_24h
    add_to_cart_15m
    purchases_1h
  for each product:
    if metrics exceed merchant rule thresholds:
       message = render_template(rule_type, metrics, geo_bucket)
       confidence = confidence_model(metrics, bot_score, unique_ratio)
       if confidence >= min_confidence:
          write social_proof_event
          push realtime update to storefront widgets and live stream overlay

on stream_host_pin_product(stream_id, product_id):
  stream_state.set_pinned_product(product_id)
  emit realtime event to viewers
  prewarm checkout/session payloads for viewers

on viewer_buy_now(stream_id, product_id, viewer_id):
  variant = resolve_default_or_selected_variant(product_id)
  token = create single-use buy_now_token(viewer_id, variant, expires=15m)
  create Stripe checkout session w/ embedded/express flow
  return in-player checkout payload
```
Sequence flow:
1. JS SDK emits signed view/add-to-cart/purchase events.
2. Event stream lands in Kafka, persisted to ClickHouse.
3. Aggregator computes privacy-safe, confidence-scored proof messages.
4. Realtime gateway pushes messages to storefront widgets and stream overlays.
5. Host pins a product during live stream; viewers receive synchronized product card.
6. Buy-now creates a one-time checkout token and opens embedded express checkout without redirect loops.

### 4. Patentable & Novelty Boundaries
- Confidence-scored transformation of anonymous storefront events into display-safe social proof objects.
- Synchronization of those proof objects with live-stream commerce state.
- Precomputed one-click, stream-bound checkout initiation tokens tied to pinned product context.
- Fraud suppression workflow that blocks low-confidence proof events before UI publication.

### 5. 3-Phase MVP Feature Priority Order
- **Phase 1 — Core Essentials:** merchant admin, page builder, catalog, inventory, checkout, orders, abandoned cart emails.
- **Phase 2 — The Moat:** event SDK, stream ingestion, social proof aggregator, live stream with product pinning and embedded buy-now.
- **Phase 3 — Scale & Polish:** anti-bot scoring, CDN edge rendering, moderation tools, merchandising analytics, multi-host streams.

### 6. Security, Compliance, & Implementation Risks
- **PCI-DSS:** use Stripe-hosted/embedded checkout to reduce card scope.
- **Privacy/GDPR/CCPA:** anonymous event tracking needs consent, retention controls, geo-bucketing, and opt-out.
- **Fraud risk:** fake social proof via scripted traffic. Mitigate with signed SDKs, device fingerprint signals, IP heuristics, and confidence thresholds.
- **Streaming complexity:** high fanout and latency. Use managed media infra and separate realtime service.
- **Inventory race conditions:** reserve stock on checkout token issue or payment intent confirmation.

---

## 2) Kill Calendly — Scheduling + Meeting Intelligence

### 1. System Architecture & Tech Stack
- **Frontend:** Next.js for booking pages, authenticated dashboard, invitee forms.
- **Backend:** Fastify/NestJS for API layer; Temporal for long-running orchestration (pre-brief, reminders, post-meeting sync).
- **Databases:** PostgreSQL (users, availability, bookings), Redis (rate limits, temporary locks), pgvector for cached participant embeddings.
- **Event Streaming / Jobs:** Temporal + Kafka/Redpanda for booking lifecycle events.
- **Integrations:** Google Calendar, Microsoft Graph, Zoom/Meet/Teams, HubSpot/Salesforce.
- **AI/ML:** Python microservice using LangChain/LlamaIndex for summarization/enrichment; spaCy for entity extraction.

### 2. Core Database Schema & Data Models
- `users(id, email, name, timezone)`
- `connected_calendars(id, user_id, provider, account_email, token_ref, scopes_json)`
- `availability_rules(id, user_id, day_of_week, start_minute, end_minute, tz)`
- `event_types(id, user_id, title, duration_min, buffers_json, location_type, slug)`
- `booking_links(id, event_type_id, slug, active)`
- `bookings(id, event_type_id, host_user_id, invitee_name, invitee_email, start_at, end_at, meeting_url, status)`
- `participants(id, booking_id, role, email, full_name, company, profile_url)`
- `enrichment_jobs(id, booking_id, status, source_manifest_json)`
- `pre_meeting_briefs(id, booking_id, markdown, structured_json, generated_at)`
- `transcripts(id, booking_id, provider, transcript_text, diarization_json)`
- `post_meeting_summaries(id, booking_id, markdown, action_items_json, generated_at)`
- `calendar_sync_logs(id, booking_id, provider, payload_json, status)`
- `crm_sync_logs(id, booking_id, provider, payload_json, status)`
- `reminders(id, booking_id, channel, scheduled_at, sent_at, status)`

### 3. The Moat Feature Logic (Deep Dive)
```pseudo
on booking_confirmed(booking_id):
  Temporal.startWorkflow(MeetingIntelWorkflow, booking_id)

workflow MeetingIntelWorkflow(booking_id):
  booking = fetch booking + participants + host profile
  parallel:
    profile_data = enrich_people(participants.profile_urls, public web, CRM)
    org_news = fetch_company_news(participants.company_domains)
    relationship_graph = fetch_shared_connections(host, participants)
  brief = synthesize_pre_brief(booking, profile_data, org_news, relationship_graph)
  store pre_meeting_brief
  deliver async email/calendar attachment to host and invitee
  schedule reminders
  wait for transcript_or_meeting_end
  transcript = ingest transcript/notes
  summary = summarize(transcript)
  tasks = extract_action_items(summary, transcript)
  write post_meeting_summary
  sync calendar extended properties/tasks
  sync CRM notes/tasks/opportunity updates
```
Pre-brief synthesis:
1. Normalize people and company entities.
2. Resolve duplicate identities across CRM/calendar/history.
3. Rank context signals by confidence and relevance.
4. Produce two role-specific briefs: host-facing and invitee-facing.

Post-meeting sync:
1. Parse transcript into decisions, owners, due dates.
2. Create structured task objects.
3. Write tasks into calendar event metadata and CRM activity feed.
4. Retry on provider failure with idempotency key.

### 4. Patentable & Novelty Boundaries
- Booking-triggered dual-sided context assembly pipeline.
- Unified workflow linking scheduling event → enrichment → transcript summary → downstream sync.
- Structured action-item extraction synchronized back into calendar objects tied to original booking identity.
- Confidence-weighted meeting brief generation from multi-source public/private context.

### 5. 3-Phase MVP Feature Priority Order
- **Phase 1 — Core Essentials:** booking links, availability, Google/Outlook sync, reminders, rescheduling, cancellations.
- **Phase 2 — The Moat:** enrichment pipeline, pre-meeting briefs, transcript ingestion, post-meeting summaries, task/calendar sync.
- **Phase 3 — Scale & Polish:** enterprise RBAC, CRM bi-directional sync, analytics, provider failover, multilingual summarization.

### 6. Security, Compliance, & Implementation Risks
- **Google/Microsoft OAuth:** store encrypted token refs, rotate refresh tokens, least-privilege scopes.
- **Transcript privacy / wiretapping laws:** explicit consent banners, region-aware recording policies.
- **LinkedIn/public scraping risk:** avoid prohibited scraping; use user-supplied URLs, permissive public web indexing, and approved data providers.
- **GDPR/CCPA:** delete-on-request for meeting artifacts; configurable retention.
- **Hallucinated summaries:** keep evidence spans, confidence scores, and editable action items.

---

## 3) Kill Patreon — Creator Membership + Co-Ownership Model

### 1. System Architecture & Tech Stack
- **Frontend:** Next.js + React Native optional mobile app.
- **Backend:** TypeScript/NestJS or Go for payment + ledger correctness.
- **Databases:** PostgreSQL for core entities, append-only double-entry ledger tables for economic rights, S3 for media, Redis for cache.
- **Event Streaming:** Kafka/Redpanda for engagement, purchases, payout accruals.
- **ML/AI:** Python scoring service for superfan ranking; anomaly/fraud scoring.
- **Payments:** Stripe Connect, Tipalti/Trolley for payouts.
- **Optional On-chain Module:** If needed later, mirror rights ledger to a chain; keep MVP off-chain for compliance simplicity.

### 2. Core Database Schema & Data Models
- `creators(id, user_id, brand_name, payout_account_ref)`
- `tiers(id, creator_id, name, monthly_price, benefits_json)`
- `subscriptions(id, tier_id, fan_user_id, status, started_at, ended_at)`
- `content_posts(id, creator_id, visibility_scope, body, asset_manifest_json)`
- `engagement_events(id, creator_id, fan_user_id, type, weight, metadata_json, occurred_at)`
- `superfan_scores(id, creator_id, fan_user_id, score, factors_json, updated_at)`
- `ownership_programs(id, creator_id, rights_type, legal_structure, rules_json, status)`
- `rights_accounts(id, program_id, fan_user_id, balance_units)`
- `ledger_entries(id, program_id, debit_account_id, credit_account_id, units, reason, created_at)`
- `revenue_pools(id, creator_id, source_type, period_start, period_end, gross_cents, distributable_cents)`
- `distribution_snapshots(id, revenue_pool_id, fan_user_id, units, share_percent, payout_cents)`
- `payouts(id, fan_user_id, amount_cents, provider_ref, status)`
- `compliance_flags(id, creator_id, jurisdiction, issue_type, status)`

### 3. The Moat Feature Logic (Deep Dive)
```pseudo
daily_score_job(creator_id):
  events = fetch engagement_events(last_90d)
  for fan in fans:
    tenure_score = months_subscribed * w1
    spend_score = normalized_ltv(fan) * w2
    moderation_score = approved_mod_actions * w3
    referral_score = successful_referrals * w4
    quality_penalty = fraud_flags * -w5
    score = tenure_score + spend_score + moderation_score + referral_score + quality_penalty
    upsert superfan_score

monthly_distribution_job(program_id):
  pool = compute distributable revenue by source (merch/sponsor/IP)
  eligible_fans = fans meeting legal + program rules
  total_weight = sum(score or units)
  for fan in eligible_fans:
    earned_units = accrual_formula(score, tenure, cap_table_rules)
    post ledger_entries to rights_accounts
  snapshot = capture balances at cutoff
  for holder in snapshot:
    payout = distributable_cents * holder.units / total_units
    create distribution_snapshot + payout record
```
Key system design choice: use an **internal rights ledger** with immutable journal entries, not ad-hoc percentage fields. That enables auditability, clawbacks, vesting, and legal wrappers.

### 4. Patentable & Novelty Boundaries
- Engagement-to-rights accrual pipeline with immutable ledger settlement.
- Programmatic distribution logic that converts superfan behavioral signals into revenue-share unit issuance.
- Snapshotting mechanism for creator-specific participation units and revenue pool distributions.
- Tenure/moderation/value weighted co-ownership accrual model.

### 5. 3-Phase MVP Feature Priority Order
- **Phase 1 — Core Essentials:** creator pages, tiers, gated content, subscriber management, payments.
- **Phase 2 — The Moat:** superfan scoring, rights ledger, revenue pool creation, distribution snapshots, payout reporting.
- **Phase 3 — Scale & Polish:** governance/voting, tax docs, regional program templates, anti-fraud, sponsor attribution.

### 6. Security, Compliance, & Implementation Risks
- **Securities law risk:** biggest blocker. Start with rev-share credits or loyalty participation under legal wrappers; obtain counsel before true equity claims.
- **Money transmission / tax:** KYC/KYB, 1099/W-8 handling, sanctioned-party screening.
- **Ledger correctness:** append-only journal, invariants, reconciliation tests.
- **Creator disputes:** transparent formula, dispute logs, versioned program terms.
- **Platform abuse:** Sybil resistance, fake engagement detection, moderation auditing.

---

## 4) Kill Notion — Workspace + Living Document Engine

### 1. System Architecture & Tech Stack
- **Frontend:** Next.js, TipTap/ProseMirror editor, Yjs for multiplayer collaboration.
- **Backend:** Rust or TypeScript service for document APIs; Python AI workers for knowledge extraction.
- **Databases:** PostgreSQL for workspaces/pages/tasks, pgvector for embeddings, Neo4j or graph projection layer for assertion/page links, Redis for collaboration presence.
- **Event Streaming / Jobs:** Kafka + Temporal/BullMQ for version indexing and background audits.
- **AI/ML:** sentence-transformers / Instructor embeddings, contradiction classifier (DeBERTa or small fine-tuned transformer), spaCy for action/date extraction.

### 2. Core Database Schema & Data Models
- `workspaces(id, name, plan)`
- `workspace_members(id, workspace_id, user_id, role)`
- `pages(id, workspace_id, parent_id, title, slug, page_type, current_version_id, updated_at)`
- `page_versions(id, page_id, content_json, plain_text, created_by, created_at)`
- `blocks(id, version_id, block_type, payload_json, position)`
- `databases(id, workspace_id, schema_json)`
- `db_rows(id, database_id, row_json)`
- `actions(id, workspace_id, page_id, assignee_id, title, status, due_at, last_touched_at)`
- `page_links(id, workspace_id, source_page_id, target_page_id, link_type)`
- `assertions(id, workspace_id, page_id, version_id, text_norm, embedding, claim_type, source_span_json)`
- `contradiction_edges(id, workspace_id, assertion_a_id, assertion_b_id, score)`
- `doc_alerts(id, workspace_id, page_id, alert_type, severity, evidence_json, status)`
- `audit_runs(id, workspace_id, started_at, completed_at, summary_json)`

### 3. The Moat Feature Logic (Deep Dive)
```pseudo
on page_version_created(version_id):
  enqueue index_document(version_id)

index_document(version_id):
  text = extract_plain_text(version.content_json)
  assertions = claim_extractor(text)
  for claim in assertions:
    embedding = embed(claim.text)
    store assertion(claim, embedding, source_span)
  link explicit page references into page_links graph
  enqueue workspace_audit(workspace_id, touched_page_id)

workspace_audit(workspace_id, touched_page_id):
  target_assertions = assertions for touched_page
  candidate_assertions = vector_search(nearest_neighbors(target_assertions))
  for pair in candidate_assertions:
    if contradiction_classifier(pair) > threshold:
       create/update contradiction_edge
       emit doc_alert(type='contradiction')
  stale_pages = pages where updated_at < policy_threshold or content mentions old dates
  for page in stale_pages: emit/update stale alert
  dormant_actions = actions where status != done and now-last_touched_at > 14 days
  emit/update dormant_action alerts
  compute workspace_health_score = weighted(alert counts, age, unresolved contradictions)
```
Key mechanics:
- Versioned content is parsed into machine-comparable assertions.
- Retrieval limits classifier work to semantically nearby pages.
- Alerts are stateful records, not ephemeral AI comments.

### 4. Patentable & Novelty Boundaries
- Version-triggered assertion extraction graph for collaborative docs.
- Combined vector retrieval + contradiction graph pipeline inside a knowledge workspace.
- Unified alert model for contradiction, staleness, and dormant action detection tied to source spans and page lineage.
- Workspace health scoring derived from unresolved knowledge integrity signals.

### 5. 3-Phase MVP Feature Priority Order
- **Phase 1 — Core Essentials:** docs, page tree, comments, tasks, basic database tables, permissions.
- **Phase 2 — The Moat:** assertion extraction, embeddings, contradiction detection, stale page scans, dormant action alerts, alert center.
- **Phase 3 — Scale & Polish:** multiplayer presence, semantic search, notification digests, enterprise RBAC, audit explainability UI.

### 6. Security, Compliance, & Implementation Risks
- **Data leakage across workspaces:** enforce tenant-scoped vector indexes and graph queries.
- **AI false positives:** show evidence spans and confidence scores; allow dismiss/snooze states.
- **Document privacy:** encrypt sensitive workspaces, support region pinning, audit trails.
- **Concurrency:** Yjs CRDTs and optimistic version merges.
- **Retention/compliance:** export/deletion, SOC 2 controls, SSO/SAML for enterprise.

---

## 5) Kill Teachable — Course Platform + Student Struggle Detector

### 1. System Architecture & Tech Stack
- **Frontend:** Next.js learner app, custom player built on Mux/Video.js or Cloudflare Stream.
- **Backend:** FastAPI or NestJS for course/quizzes; Python analytics service for struggle detection.
- **Databases:** PostgreSQL for courses/users/progress, ClickHouse for high-volume playback telemetry, Redis for session state, S3 for assets.
- **Streaming / Jobs:** Kafka for playback events; Airflow/Temporal for nightly analytics jobs.
- **AI/ML:** scikit-learn/XGBoost for struggle scoring, LLM service for clarification-card drafting.

### 2. Core Database Schema & Data Models
- `schools(id, owner_id, name)`
- `courses(id, school_id, title, slug, status)`
- `sections(id, course_id, title, position)`
- `lessons(id, section_id, type, title, video_asset_id, duration_sec, concept_tags_json)`
- `students(id, email, profile_json)`
- `enrollments(id, course_id, student_id, status)`
- `progress(id, lesson_id, student_id, watched_sec, completed_at)`
- `playback_events(id, lesson_id, student_id, session_id, event_type, second_mark, occurred_at)`
- `quiz_questions(id, lesson_id, prompt, answer_key_json, concept_tags_json)`
- `quiz_attempts(id, lesson_id, student_id, score, answers_json)`
- `struggle_segments(id, lesson_id, start_sec, end_sec, score, signal_breakdown_json)`
- `instructor_alerts(id, lesson_id, alert_type, severity, evidence_json, status)`
- `clarification_cards(id, lesson_id, insert_sec, content_json, source_alert_id, active)`

### 3. The Moat Feature Logic (Deep Dive)
```pseudo
for each lesson daily:
  telemetry = playback_events grouped into 10s buckets
  quiz_data = quiz_attempts joined to concept tags

  for bucket in lesson.timeline:
    rewind_density = count(seek_back into bucket) / viewers
    pause_density = pauses in bucket / viewers
    replay_rate = repeat_watchers(bucket) / viewers
    dropoff_delta = exit_rate(bucket) - baseline_exit_rate
    concept_fail_rate = quiz_fail_rate(concepts linked to bucket)

    struggle_score = w1*rewind_density + w2*pause_density + w3*replay_rate + w4*dropoff_delta + w5*concept_fail_rate
    if struggle_score > threshold:
       create struggle_segment
       create instructor_alert
       if auto_remediation_enabled:
          clarification = generate_clarification(bucket transcript, missed_concepts, common_wrong_answers)
          upsert clarification_card at bucket.start_sec
```
Instructor view should show evidence, not just score:
- heatmap over video timeline
- exact quiz items associated with the concept
- top wrong answers
- suggested remediation: “re-record segment 04:20–05:10” or “insert short visual example”

### 4. Patentable & Novelty Boundaries
- Joint computation using micro-rewinds, pause clusters, dropout deltas, and quiz failure clustering tied to timestamp windows.
- Automatic insertion of remediation objects at detected struggle timestamps.
- Mapping of assessment concept tags back onto video timeline buckets for remediation generation.

### 5. 3-Phase MVP Feature Priority Order
- **Phase 1 — Core Essentials:** course hosting, video delivery, quizzes, certificates, progress tracking.
- **Phase 2 — The Moat:** playback telemetry pipeline, struggle scoring, instructor alerts, auto-insert clarification cards.
- **Phase 3 — Scale & Polish:** adaptive remediation, cohort comparison, A/B tests on clarification cards, mobile analytics parity.

### 6. Security, Compliance, & Implementation Risks
- **Student privacy / FERPA-like concerns:** minimize PII in analytics; aggregate by cohort for dashboards.
- **COPPA risk for minors:** parental consent if applicable; age-gating.
- **Telemetry volume:** ClickHouse or BigQuery-style warehouse needed early.
- **Bad remediation:** require instructor approval for AI cards by default.
- **Video CDN costs:** use managed encoding and retention tiers.

---

## 6) Kill OpenTable — Reservations + Taste Profile Passport

### 1. System Architecture & Tech Stack
- **Frontend:** Next.js diner + restaurant dashboard, tablet-first host UI.
- **Backend:** Go or NestJS for reservations and floor planning; Python preference modeling service.
- **Databases:** PostgreSQL with PostGIS for restaurant search, Redis for availability caching, encrypted profile store for diner passport, S3 for menu data/media.
- **Event Streaming / Jobs:** Kafka for reservation events and visit feedback; scheduled brief generation workers.
- **AI/ML:** lightweight preference inference using factorization / gradient boosting; optional LLM for diner brief summarization.
- **Security Primitives:** client-side encryption / HPKE for zero-knowledge preference payloads, KMS-managed key hierarchy.

### 2. Core Database Schema & Data Models
- `restaurants(id, name, cuisine_tags, location_geo, settings_json)`
- `tables(id, restaurant_id, name, seats, zone, attributes_json)`
- `service_slots(id, restaurant_id, starts_at, ends_at, party_capacity)`
- `reservations(id, restaurant_id, diner_id, starts_at, party_size, status, occasion, notes)`
- `diner_profiles(id, user_id, public_basics_json)`
- `taste_passports(id, diner_id, encrypted_pref_blob, zk_metadata_json, updated_at)`
- `menu_items(id, restaurant_id, name, flavor_tags_json, dietary_tags_json, sodium_score, spice_score)`
- `visit_histories(id, reservation_id, diner_id, dishes_json, feedback_json, spend_cents)`
- `brief_tokens(id, reservation_id, derived_brief_blob, expires_at, consumed_at)`
- `restaurant_briefs(id, reservation_id, summary_text, structured_traits_json, generated_at)`

### 3. The Moat Feature Logic (Deep Dive)
Portable zero-knowledge profile design:
1. Diner app stores a structured preference vector locally (dietary restrictions, preferred flavor dimensions, allergy flags, celebration types).
2. Vector is encrypted client-side with a diner-controlled key.
3. On reservation confirmation, diner grants a **reservation-scoped reveal policy**: only necessary traits and scores needed for hospitality are derivable.
4. Server generates a brief token containing either:
   - a derived encrypted brief blob for that restaurant, or
   - a policy-limited reveal using HPKE to the restaurant’s public key.

```pseudo
on reservation_confirmed(reservation_id):
  passport = fetch encrypted diner passport
  if diner consent policy exists:
    derived_traits = client_or_secure_worker.derive([
      allergies,
      dietary_flags,
      top_flavor_axes,
      occasion,
      notable service prefs
    ])
    brief = summarize(derived_traits, recent visit history, menu affinities)
    encrypt brief for restaurant public key
    store brief_token(expires=reservation_start-30m)

30m before reservation:
  host_console requests brief
  verify reservation scope + role
  decrypt/render brief
```
Example output: “Vegetarian; shellfish allergy; enjoys high-umami and moderate spice; low-sodium preference inferred from last 3 visits; anniversary noted.”

### 4. Patentable & Novelty Boundaries
- Reservation-scoped derivation of hospitality-relevant preference summaries from a portable encrypted taste profile.
- Controlled reveal workflow that shares only derived diner brief traits, not raw preference history.
- Preference inference pipeline combining visit history and menu flavor taxonomy into pre-arrival briefs.

### 5. 3-Phase MVP Feature Priority Order
- **Phase 1 — Core Essentials:** search, reservations, floor plan, waitlist, host dashboard.
- **Phase 2 — The Moat:** encrypted taste passport, menu flavor tagging, 30-minute diner brief generation, visit feedback loop.
- **Phase 3 — Scale & Polish:** cross-restaurant loyalty, portable consent settings, recommendation engine, POS integrations.

### 6. Security, Compliance, & Implementation Risks
- **Sensitive dietary/allergy data:** treat as sensitive personal data; consent and encryption mandatory.
- **“Zero-knowledge” claims:** do not overclaim. Ensure architecture truly limits server visibility or use secure-worker boundaries.
- **Restaurant operational adoption:** make briefs concise and role-specific; avoid overwhelming staff.
- **Location/privacy laws:** geolocation and dining history need explicit controls.
- **Availability correctness:** high-contention booking windows require row locks / optimistic concurrency.

---

## 7) Kill Fiverr — Freelance Marketplace + Collaborative Bidding System

### 1. System Architecture & Tech Stack
- **Frontend:** Next.js client portal, freelancer console, proposal co-authoring UI.
- **Backend:** Go or NestJS for marketplace APIs; collaborative editing service with Yjs/CRDTs for shared proposals.
- **Databases:** PostgreSQL for marketplace core, Neo4j or pgvector for skill graph/squad matching, Redis for ephemeral collaboration state.
- **Event Streaming:** Kafka for proposals, milestone events, disputes, payouts.
- **Payments/Contracts:** Stripe Connect + escrow provider; DocuSign/Dropbox Sign or internal signature service.
- **AI/ML:** recommendation engine for squad composition and risk scoring.

### 2. Core Database Schema & Data Models
- `users(id, type, name, email, reputation_score)`
- `freelancer_profiles(id, user_id, skills_json, portfolio_json, availability_json)`
- `client_profiles(id, user_id, company_name, billing_ref)`
- `projects(id, client_id, title, scope, budget_range, status)`
- `skill_graph_nodes(id, skill_name, category)`
- `skill_graph_edges(id, source_skill, target_skill, relation_type, weight)`
- `squads(id, project_id, lead_user_id, status)`
- `squad_members(id, squad_id, freelancer_id, role_title, split_percent, responsibility_json)`
- `proposal_docs(id, squad_id, version_id, content_json)`
- `contracts(id, project_id, squad_id, terms_json, signature_status)`
- `milestones(id, contract_id, title, amount_cents, due_at, status)`
- `deliverables(id, milestone_id, submitted_by, artifact_manifest_json)`
- `escrow_accounts(id, contract_id, provider_ref, balance_cents, status)`
- `payout_splits(id, contract_id, freelancer_id, amount_cents, status)`
- `disputes(id, contract_id, stage, evidence_json)`

### 3. The Moat Feature Logic (Deep Dive)
```pseudo
on enterprise_project_posted(project):
  required_skills = parse_scope_to_skill_vector(project.scope)
  candidate_freelancers = search skill_graph + availability + rating
  generate top squad combinations under constraints:
    - coverage of required skills
    - timezone overlap
    - historical collaboration score
    - budget fit
  return squad suggestions or let freelancers self-form

when freelancers form squad:
  create squad record
  enable shared CRDT proposal doc
  require role ownership + split percentages sum to 100%
  generate unified contract terms from squad roles and milestone plan

on client_acceptance:
  open escrow once
  bind milestone ownership matrix
  on milestone approval:
    release escrow into payout_splits according to split table
```
Important architectural twist: squad is a first-class entity across proposal, contract, escrow, milestones, reviews, and payout flows—not just a chat group.

### 4. Patentable & Novelty Boundaries
- Dynamic assembly of independent providers into a temporary, contractable delivery unit.
- Shared proposal + role matrix + unified contract/payout pipeline for a composite service team.
- Automated escrow disbursement tied to squad split rules and milestone approvals.

### 5. 3-Phase MVP Feature Priority Order
- **Phase 1 — Core Essentials:** listings, project posts, proposals, messaging, escrow, reviews.
- **Phase 2 — The Moat:** squad entity, collaborative proposal editor, split matrix, unified contract, milestone-linked split payouts.
- **Phase 3 — Scale & Polish:** skill-graph squad recommendations, enterprise procurement features, insurance/compliance docs.

### 6. Security, Compliance, & Implementation Risks
- **Employment misclassification:** marketplace terms must preserve contractor independence.
- **Escrow / payouts:** money movement and KYC/KYB obligations.
- **Contract disputes:** immutable audit trails for edits, approvals, signatures.
- **Squad conflicts:** lead replacement logic, deadlock handling, split change versioning.
- **Enterprise trust:** compliance docs, NDA templates, access logs.

---

## 8) Kill Mailchimp — Email Marketing + Send Time Personalization Engine

### 1. System Architecture & Tech Stack
- **Frontend:** Next.js campaign builder and analytics UI.
- **Backend:** Go for high-throughput dispatch engine; Node/TypeScript for admin/product APIs.
- **Databases:** PostgreSQL for accounts/campaigns/subscribers, ClickHouse for event telemetry, Redis for queue scheduling, object storage for templates/assets.
- **Event Streaming:** Kafka/Redpanda for opens, clicks, bounces, provider webhooks.
- **ML/AI:** Python service using XGBoost/Bayesian survival models; MLflow for model tracking.
- **ESP Layer:** SES, Postmark, SendGrid, or SparkPost via provider abstraction.

### 2. Core Database Schema & Data Models
- `accounts(id, name, plan)`
- `audiences(id, account_id, name)`
- `subscribers(id, audience_id, email, tz, attributes_json, consent_status)`
- `segments(id, audience_id, rule_json)`
- `campaigns(id, account_id, subject, body_html, body_json, send_window_json, status)`
- `campaign_recipients(id, campaign_id, subscriber_id, predicted_send_at, actual_send_at, delivery_status)`
- `engagement_events(id, subscriber_id, campaign_id, type, occurred_at, metadata_json)`
- `send_time_profiles(id, subscriber_id, model_version, feature_blob, preferred_minute_histogram_json, confidence)`
- `dispatch_queue(id, campaign_id, subscriber_id, release_at, priority, status)`
- `provider_logs(id, message_id, provider, raw_webhook_json, status)`

### 3. The Moat Feature Logic (Deep Dive)
```pseudo
nightly_profile_job(subscriber_id):
  history = fetch opens/clicks over 180 days in subscriber local time
  features = {
    weekday x hour x minute buckets,
    recency decay,
    device type,
    campaign category,
    seasonality,
    no-open streak
  }
  if history < cold_start_threshold:
     profile = cohort_model(segment, timezone, engagement level)
  else:
     profile = personalized_model.predict_open_probability_by_minute(next_7d)
  store best minutes + confidence

campaign_launch(campaign_id):
  recipients = resolve audience/segment
  for each recipient:
     predicted_send_at = argmax P(open | subscriber, minute) within campaign send window
     enqueue dispatch_queue(release_at=predicted_send_at)

dispatch_worker(now):
  dequeue recipients where release_at <= now
  batch by ESP throughput + IP warming constraints
  send message
  stream events back to telemetry warehouse
  online-learn from opens/clicks for future profile updates
```
Additional optimization: hold messages in a dynamic queue and reflow release times if provider throughput or inbox fatigue rules change.

### 4. Patentable & Novelty Boundaries
- Minute-level individualized send-time prediction constrained by campaign send windows and provider throughput.
- Dynamic queue reflow algorithm combining per-subscriber send-time scores with global throughput constraints.
- Cold-start fallback hierarchy from subscriber → segment → timezone cohort.

### 5. 3-Phase MVP Feature Priority Order
- **Phase 1 — Core Essentials:** builder, audience management, segments, automations, campaign send, analytics.
- **Phase 2 — The Moat:** per-subscriber profiles, minute-level prediction, dynamic release queue, webhook feedback loop.
- **Phase 3 — Scale & Polish:** inbox fatigue rules, IP warming, deliverability scoring, multi-provider routing.

### 6. Security, Compliance, & Implementation Risks
- **CAN-SPAM/GDPR/PECR:** consent, unsubscribe, lawful basis, suppression lists.
- **Deliverability:** poor list hygiene kills sender reputation. Add bounce management and domain authentication.
- **Prediction accuracy:** small history for most contacts. Use layered cold-start models.
- **Queue scale:** millions of recipient-specific release times require Redis + sharded workers.
- **Time zone edge cases:** DST handling and local-time normalization are mandatory.

---

## 9) Kill Eventbrite — Ticketing + Serendipity Matchmaking Layer

### 1. System Architecture & Tech Stack
- **Frontend:** Next.js organizer UI + attendee web/mobile app.
- **Backend:** Go or NestJS for ticketing and check-in; graph matching service in Python.
- **Databases:** PostgreSQL for events/orders/tickets, Neo4j or pgvector for attendee graph/match scoring, Redis for check-in and ephemeral signaling, PostGIS for venue geofencing.
- **Event Streaming:** Kafka for registration, profile updates, check-ins, proximity signals.
- **Mobile / Proximity:** React Native app; Bluetooth LE + geofenced venue zones for “signal to connect.”
- **AI/ML:** embedding model for goals/interests similarity; graph ranking algorithm.

### 2. Core Database Schema & Data Models
- `organizers(id, user_id, org_name)`
- `events(id, organizer_id, title, venue_geo, starts_at, settings_json)`
- `ticket_types(id, event_id, name, price_cents, quantity)`
- `orders(id, event_id, buyer_id, total_cents, status)`
- `tickets(id, order_id, attendee_id, qr_code, checked_in_at)`
- `attendee_profiles(id, user_id, headline, goals_json, interests_json, company, title)`
- `event_preferences(id, event_id, attendee_id, networking_goals_json, opt_in_status)`
- `match_scores(id, event_id, attendee_a_id, attendee_b_id, score, rationale_json)`
- `top_match_lists(id, event_id, attendee_id, ranked_matches_json, generated_at)`
- `proximity_signals(id, event_id, from_attendee_id, to_attendee_id, zone_id, created_at)`
- `connections(id, event_id, attendee_a_id, attendee_b_id, accepted_at)`
- `venue_zones(id, event_id, name, geo_polygon)`

### 3. The Moat Feature Logic (Deep Dive)
```pseudo
24h_before_event(event_id):
  attendees = fetch opted-in attendees with profile + goals
  embeddings = embed(profile + goals + interests)
  graph = build weighted graph where edges combine:
      semantic similarity
      goal complementarity (hiring vs job seeking, founder vs investor)
      mutual relevance penalties (same company, duplicate role)
      prior connection suppression
  for each attendee:
      rank candidates by score + diversity constraints
      produce Top5 list with rationale and meeting suggestions
      deliver brief via email/app

on live_event_proximity(attendee_a, attendee_b, zone):
  if both opted_in and pair in top_matches:
      show 'Signal to Connect' affordance
      if a signals and b is nearby:
          notify b with accept/decline
          if accepted: create connection, optionally exchange digital cards
```
Use geofenced zones, not exact continuous location, to reduce privacy risk and battery drain.

### 4. Patentable & Novelty Boundaries
- Pre-event graph ranking producing individualized top-N networking briefs from attendee goal complementarity.
- Live proximity gating that only enables signaling for pre-ranked matches within authorized venue zones.
- Diversity-constrained match ranking rather than simple similarity matching.

### 5. 3-Phase MVP Feature Priority Order
- **Phase 1 — Core Essentials:** event creation, ticketing, checkout, QR check-in, attendee profiles.
- **Phase 2 — The Moat:** match scoring, Top 5 brief generation, opt-in networking, venue-zone signal to connect.
- **Phase 3 — Scale & Polish:** organizer analytics on network outcomes, sponsor matchmaking, privacy-preserving proximity improvements.

### 6. Security, Compliance, & Implementation Risks
- **Payment + PII:** PCI delegation, GDPR/CCPA deletion/export.
- **Location privacy:** use coarse venue zones, explicit opt-in, no background tracking beyond event session.
- **Harassment risk:** block/report flows, one-way signal until accepted, organizer moderation.
- **Cold start:** weak profiles produce bad matches; require onboarding prompts.
- **Battery/network:** BLE/geofence tuning and offline-tolerant check-in.

---

## 10) Kill LinkedIn — Professional Network + Proof-of-Work Profile

### 1. System Architecture & Tech Stack
- **Frontend:** Next.js + GraphQL/React Query, artifact-focused profile UI.
- **Backend:** Go or NestJS for social/job APIs; dedicated verification service in Rust or Python for cryptographic checks and evidence extraction.
- **Databases:** PostgreSQL for users/jobs/social graph, graph DB for artifact-to-skill evidence relationships, S3 for artifact metadata caches, Redis for feeds/search cache.
- **Search:** OpenSearch / Typesense for recruiter search; pgvector for artifact semantic retrieval.
- **AI/ML:** NLP extraction service for skills/outcomes from verified artifacts; ranking models for recruiter relevance.
- **Crypto:** libsodium/OpenSSL for signature validation; Git commit verification; domain TXT verification; signed client attestations.

### 2. Core Database Schema & Data Models
- `users(id, email, name, visibility_json)`
- `profiles(id, user_id, headline, summary, public_slug)`
- `artifacts(id, user_id, artifact_type, source_url, provider, verification_status, metadata_json, verified_at)`
- `artifact_signatures(id, artifact_id, signature_type, public_key_ref, verification_result)`
- `artifact_claims(id, artifact_id, claim_type, normalized_value, confidence, evidence_span_json)`
- `skills(id, name, category)`
- `profile_skill_evidence(id, profile_id, skill_id, artifact_id, evidence_score, outcome_score)`
- `projects(id, user_id, title, verification_status, outcome_metrics_json)`
- `client_attestations(id, subject_user_id, client_domain, signed_blob, verification_status)`
- `jobs(id, company_id, title, requirements_json)`
- `applications(id, job_id, applicant_id, status)`
- `connections(id, user_a_id, user_b_id, created_at)`
- `communities(id, name, topic)`

### 3. The Moat Feature Logic (Deep Dive)
Artifact verification pipeline:
```pseudo
on artifact_submitted(user_id, source):
  detect artifact_type
  if github_commit:
     verify commit signature / commit association / repo ownership
  if live_api:
     challenge endpoint with nonce and verify signed response or domain control
  if published writing:
     verify domain ownership or author token placement
  if client attestation:
     verify client domain email or signed attestation blob
  if verification passes:
     extract claims = skills, technologies, outcomes, dates, scale indicators
     map claims to skill ontology
     write profile_skill_evidence rows
     recompute profile credibility score

recruiter_view(profile):
  show only evidence-backed skills
  for each skill:
     display source artifacts, confidence, outcomes, recency
  hide or down-rank unsupported self-descriptions
```
Core design principle: skills are **derived** from verified artifacts, not manually entered as truth.

### 4. Patentable & Novelty Boundaries
- Profile construction workflow where professional competencies are derived from cryptographically or structurally verified artifacts.
- Evidence graph connecting artifacts → claims → skills → recruiter ranking.
- Verification challenges for live endpoints, signed client attestations, and repo/domain ownership unified into one credibility system.
- Recruiter ranking based on artifact-backed evidence scores rather than self-declared skill attributes.

### 5. 3-Phase MVP Feature Priority Order
- **Phase 1 — Core Essentials:** profiles, jobs, communities, messaging, basic artifact uploads/imports.
- **Phase 2 — The Moat:** verification service, claim extraction, evidence graph, proof-backed skills, recruiter evidence view.
- **Phase 3 — Scale & Polish:** advanced search/ranking, fraud detection, enterprise ATS integrations, credential portability.

### 6. Security, Compliance, & Implementation Risks
- **Impersonation / forged proofs:** signed challenges, domain verification, commit signature checks, attestation revocation.
- **Defamation / incorrect inference:** user review workflow for extracted claims and dispute resolution.
- **Privacy:** users may expose sensitive repo/project info; granular visibility controls are required.
- **Employment bias:** audit ranking models and offer explainable recruiter scoring.
- **Third-party platform ToS:** avoid prohibited scraping; favor direct user-authorized imports and open/public verifications.

---

## Cross-Portfolio Notes

### Most technically patentable concepts
1. Living Document Engine (#4)
2. Student Struggle Detector (#5)
3. Proof-of-Work Profile (#10)
4. Meeting Intelligence (#2)

### Highest regulatory risk
1. Creator Co-Ownership Model (#3)
2. Taste Profile Passport (#6)
3. LinkedIn-style artifact verification if using restricted data sources (#10)

### Fastest to commercialize
1. Scheduling + Meeting Intelligence (#2)
2. Email Send-Time Engine (#8)
3. Course Platform + Struggle Detector (#5)

### Hardest engineering surface area
1. E-Commerce + Live Streams (#1)
2. Workspace + Living Docs (#4)
3. Proof-of-Work Network (#10)
