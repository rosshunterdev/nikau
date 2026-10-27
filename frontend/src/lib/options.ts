// Database code → what the screen shows

export const LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export const SUPPORT_NEEDED = [
  { value: 'own', label: 'On their own' },
  { value: 'worker_present', label: 'With a worker nearby' },
  { value: 'one_to_one', label: 'One-to-one support' },
]

export const TRANSPORT = [
  { value: 'bus_train_with_worker', label: 'Bus or train with a worker' },
  { value: 'bus_train_alone', label: 'Bus or train on their own' },
  { value: 'worker_drives', label: 'Worker drives' },
  { value: 'mobility_taxi', label: 'Mobility taxi' },
]

export const DAYS = [
  { value: 'mon', label: 'Monday' },
  { value: 'tue', label: 'Tuesday' },
  { value: 'wed', label: 'Wednesday' },
  { value: 'thu', label: 'Thursday' },
  { value: 'fri', label: 'Friday' },
  { value: 'sat', label: 'Saturday' },
  { value: 'sun', label: 'Sunday' },
]

export const SLOTS = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
]

export const ACTIVITY_TRANSPORT = [
  { value: 'bus_route', label: 'On a bus route' },
  { value: 'mobility_parking', label: 'Mobility parking' },
  { value: 'door_drop_off', label: 'Door drop-off' },
]

export const SUPPORT_WORKER_POLICY = [
  { value: 'attend_free', label: 'Worker attends free' },
  { value: 'attend_with_charge', label: 'Worker pays to attend' },
  { value: 'not_allowed', label: 'Workers not allowed' },
]