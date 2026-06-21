"""Smoke tests for scheduler-core package wiring."""


def test_scheduler_core_can_be_imported() -> None:
    """The installed package exposes the scheduler-core module."""
    import scheduler_core

    assert scheduler_core.__doc__ is not None
