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