# Demo flow — teachable-struggle-detector

Seeded: course `course_ml101`, lesson `lesson_backprop` (10 min, concept timeline), 8 students
with rewinds clustered at 200–240s, 2 dropoffs at 250s, and quiz attempts failing
backprop-tagged questions ~40%+ of the time.

1. `curl localhost:4005/health`
2. `curl -XPOST localhost:4005/lessons/lesson_backprop/analyze`
   — segments sorted by score; the 200–240s window tops the list with a full signal breakdown
   (rewindCluster / pauseCluster / replayRate / dropoffLift / conceptFailRate)
   — response includes `clarificationCard` with `active: false` (approval gate)
3. `curl localhost:4005/lessons/lesson_backprop/alerts` — evidence-carrying instructor alerts
4. `curl -XPOST localhost:4005/clarification-cards/<cardId>/approve`
   — now the card is active for learners; approving is an explicit instructor action
5. Re-run analyze → segments are replaced (idempotent), no duplicate card for the same window
6. `curl -XPOST localhost:4005/lessons/lesson_backprop/events -H 'content-type: application/json' \
     -d '{"events":[{"studentId":"s9","type":"watch","secondMark":10}]}'` — ingest more telemetry
