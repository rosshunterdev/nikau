"""Shapes of provider data the API sends and receives."""

from datetime import date, datetime
from typing import Self

from pydantic import BaseModel, Field, field_validator, model_validator


class Provider(BaseModel):
    """One provider, for the list and the edit form."""

    provider_id: str
    name: str
    contact_email: str | None = None
    contact_phone: str | None = None
    website: str | None = None
    consent_given: bool = False
    consent_date: date | None = None
    created_at: datetime


class ProviderCreate(BaseModel):
    """What the 'Add a provider' form sends. Only the name is required."""

    name: str = Field(min_length=1, max_length=200)
    contact_email: str | None = Field(default=None, max_length=254)
    contact_phone: str | None = Field(default=None, max_length=30)
    website: str | None = Field(default=None, max_length=500)
    consent_given: bool = False
    consent_date: date | None = None

    @model_validator(mode="after")
    def consent_needs_date(self) -> Self:
        """Same rule as the database: consent given means a consent date."""
        if self.consent_given and self.consent_date is None:
            raise ValueError("Add the date the provider gave consent")
        return self


class ProviderUpdate(BaseModel):
    """What the edit form sends. Every field is optional: only sent fields change."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    contact_email: str | None = Field(default=None, max_length=254)
    contact_phone: str | None = Field(default=None, max_length=30)
    website: str | None = Field(default=None, max_length=500)
    consent_given: bool | None = None
    consent_date: date | None = None

    @field_validator("name")
    @classmethod
    def cannot_be_cleared(cls, value):
        """Can be left out, but not cleared with null (required in the database)."""
        if value is None:
            raise ValueError("is required and can't be cleared")
        return value