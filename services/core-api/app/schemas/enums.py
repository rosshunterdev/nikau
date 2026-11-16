"""Allowed values. These must match the enums in the create_enums migration."""

from typing import Literal

Level = Literal["low", "medium", "high"]
SupportNeeded = Literal["own", "worker_present", "one_to_one"]
ClientTransport = Literal[
    "bus_train_with_worker", "bus_train_alone", "worker_drives", "mobility_taxi"
]
Day = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
Slot = Literal["morning", "afternoon", "evening"]
ActivityTransport = Literal["bus_route", "mobility_parking", "door_drop_off"]
SupportWorkerPolicy = Literal["attend_free", "attend_with_charge", "not_allowed"]
# SCRUM-129 fix 08: the rest of the activity form (hi-fi 11)
Joining = Literal["drop_in", "book_ahead", "term_enrolment", "waitlist"]
GroupSize = Literal["under_10", "10_to_20", "over_20"]
StaffSupport = Literal["staff_can_assist", "bring_own_support"]
CheckMethod = Literal["provider_website", "phone_call", "email", "visited_in_person"]
LeadSource = Literal["ai_match", "manual_search"]
MatchCallType = Literal["http", "direct"]
MatchResult = Literal[
    "success", "timeout", "error", "invalid_output", "no_candidates", "no_good_fit"
]