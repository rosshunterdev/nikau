"""What the dropdown-list endpoints send back."""

from pydantic import BaseModel


class Suburb(BaseModel):
    suburb_id: str
    name: str
    territorial_authority: str  # the council, e.g. "Wellington City"


class Tag(BaseModel):
    tag_id: str
    name: str
