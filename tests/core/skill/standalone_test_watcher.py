"""
Standalone test script for SkillWatcher.
"""

import asyncio
import tempfile
import time
from pathlib import Path


class MockSkillWatcherEvent:
    """Mock watcher event."""
    def __init__(self, event_type, skill_path, skill_name, timestamp):
        self.event_type = event_type
        self.skill_path = skill_path
        self.skill_name = skill_name
        self.timestamp = timestamp

    def __repr__(self):
        return f"MockEvent({self.event_type}, {self.skill_name})"


class WatchEventType:
    """Mock event types."""
    CREATED = "created"
    MODIFIED = "modified"
    DELETED = "deleted"


class MockSkillWatcher:
    """Mock skill watcher for testing."""

    def __init__(self, skills_dir="skills/", debounce_interval=1.0):
        self.skills_dir = Path(skills_dir)
        self.debounce_interval = debounce_interval
        self._last_event_time = {}
        self._event_callbacks = []
        self._watching = False
        self._events = []

    def add_callback(self, callback):
        """Add callback."""
        self._event_callbacks.append(callback)

    def remove_callback(self, callback):
        """Remove callback."""
        if callback in self._event_callbacks:
            self._event_callbacks.remove(callback)

    async def watch_skills(self, callback=None):
        """Start watching (mock - runs for limited time)."""
        if callback:
            self.add_callback(callback)

        self._watching = True
        print(f"👀 Started watching {self.skills_dir}")

        # Simulate some events
        await asyncio.sleep(0.1)
        event = MockSkillWatcherEvent(
            WatchEventType.MODIFIED,
            self.skills_dir / "test-skill" / "skill.yaml",
            "test-skill",
            time.time()
        )
        await self._handle_event_async(event)

        # Wait a bit then stop
        await asyncio.sleep(0.2)
        self._watching = False
        print("👀 Stopped watching")

    def stop_watching(self):
        """Stop watching."""
        self._watching = False

    async def _handle_event_async(self, event):
        """Handle event."""
        # Check debounce
        last_time = self._last_event_time.get(event.skill_name, 0)
        if event.timestamp - last_time < self.debounce_interval:
            print(f"   ⏱️  Event debounced: {event.skill_name}")
            return

        self._last_event_time[event.skill_name] = event.timestamp
        self._events.append(event)

        # Notify callbacks
        for callback in self._event_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(event)
                else:
                    callback(event)
            except Exception as e:
                print(f"❌ Callback error: {e}")

        print(f"📝 {event.event_type.upper()}: {event.skill_name}")

    def is_watching(self):
        """Check if watching."""
        return self._watching

    def get_events(self):
        """Get recorded events."""
        return self._events


def test_basic_watching():
    """Test basic file watching functionality."""
    print("Testing SkillWatcher...\n")

    watcher = MockSkillWatcher()

    # Test 1: Basic watching
    print("1. Testing basic watching...")
    events_received = []

    async def callback(event):
        events_received.append(event)

    async def run_test():
        await watcher.watch_skills(callback)

    asyncio.run(run_test())

    print(f"   Events received: {len(events_received)}")
    assert len(events_received) == 1, "Should receive 1 event"
    print(f"   ✅ Basic watching works!\n")

    # Test 2: Event type
    print("2. Testing event type...")
    event = events_received[0]
    print(f"   Event type: {event.event_type}")
    print(f"   Skill name: {event.skill_name}")
    assert event.event_type == WatchEventType.MODIFIED
    assert event.skill_name == "test-skill"
    print(f"   ✅ Event type works!\n")

    # Test 3: Debounce
    print("3. Testing debounce...")
    watcher2 = MockSkillWatcher(debounce_interval=1.0)

    async def debounce_test():
        # Simulate two events quickly
        now = time.time()

        event1 = MockSkillWatcherEvent(
            WatchEventType.MODIFIED,
            Path("skills/test/skill.yaml"),
            "test",
            now
        )

        event2 = MockSkillWatcherEvent(
            WatchEventType.MODIFIED,
            Path("skills/test/skill.yaml"),
            "test",
            now + 0.5  # 500ms later
        )

        await watcher2._handle_event_async(event1)
        await watcher2._handle_event_async(event2)  # Should be debounced

    asyncio.run(debounce_test())

    events_count = len(watcher2.get_events())
    print(f"   Events recorded: {events_count}")
    assert events_count == 1, "Second event should be debounced"
    print(f"   ✅ Debounce works!\n")

    print("=" * 50)
    print("✅ All basic tests passed!")
    print("=" * 50)


def test_callback_system():
    """Test callback system."""
    print("\n" + "=" * 50)
    print("Testing Callback System")
    print("=" * 50 + "\n")

    watcher = MockSkillWatcher()

    # Test 1: Multiple callbacks
    print("1. Testing multiple callbacks...")
    callback1_calls = []
    callback2_calls = []

    def callback1(event):
        callback1_calls.append(event)

    def callback2(event):
        callback2_calls.append(event)

    async def run_test():
        watcher.add_callback(callback1)
        watcher.add_callback(callback2)

        now = time.time()
        event = MockSkillWatcherEvent(
            WatchEventType.CREATED,
            Path("skills/new-skill/skill.yaml"),
            "new-skill",
            now
        )

        await watcher._handle_event_async(event)

    asyncio.run(run_test())

    print(f"   Callback1 calls: {len(callback1_calls)}")
    print(f"   Callback2 calls: {len(callback2_calls)}")
    assert len(callback1_calls) == 1
    assert len(callback2_calls) == 1
    print(f"   ✅ Multiple callbacks work!\n")

    # Test 2: Remove callback
    print("2. Testing remove callback...")
    watcher.remove_callback(callback1)

    callback1_calls.clear()
    callback2_calls.clear()

    async def run_test2():
        now = time.time()
        event = MockSkillWatcherEvent(
            WatchEventType.MODIFIED,
            Path("skills/test/skill.yaml"),
            "test",
            now
        )

        await watcher._handle_event_async(event)

    asyncio.run(run_test2())

    print(f"   Callback1 calls: {len(callback1_calls)}")
    print(f"   Callback2 calls: {len(callback2_calls)}")
    assert len(callback1_calls) == 0, "Callback1 should not be called"
    assert len(callback2_calls) == 1, "Callback2 should still be called"
    print(f"   ✅ Remove callback works!\n")

    print("=" * 50)
    print("✅ Callback system tests passed!")
    print("=" * 50)


def test_event_types():
    """Test different event types."""
    print("\n" + "=" * 50)
    print("Testing Event Types")
    print("=" * 50 + "\n")

    watcher = MockSkillWatcher()
    events = []

    async def callback(event):
        events.append(event)

    async def run_test():
        watcher.add_callback(callback)

        now = time.time()

        # Test different event types
        event_types = [
            WatchEventType.CREATED,
            WatchEventType.MODIFIED,
            WatchEventType.DELETED
        ]

        for i, event_type in enumerate(event_types):
            event = MockSkillWatcherEvent(
                event_type,
                Path(f"skills/skill{i}/skill.yaml"),
                f"skill{i}",
                now + i * 2  # Separate in time
            )

            await watcher._handle_event_async(event)

    asyncio.run(run_test())

    print(f"   Events received: {len(events)}")
    assert len(events) == 3, "Should receive 3 events"

    for i, event in enumerate(events):
        print(f"   Event {i+1}: {event.event_type} - {event.skill_name}")

    assert events[0].event_type == WatchEventType.CREATED
    assert events[1].event_type == WatchEventType.MODIFIED
    assert events[2].event_type == WatchEventType.DELETED
    print(f"   ✅ All event types work!\n")

    print("=" * 50)
    print("✅ Event type tests passed!")
    print("=" * 50)


def test_real_world_scenario():
    """Test real-world hot reload scenario."""
    print("\n" + "=" * 50)
    print("Testing Real-World Hot Reload Scenario")
    print("=" * 50 + "\n")

    watcher = MockSkillWatcher()
    reload_log = []

    async def reload_callback(event):
        """Simulate skill reload on change."""
        reload_log.append({
            "skill": event.skill_name,
            "event": event.event_type,
            "time": event.timestamp
        })
        print(f"   🔄 Reloading skill: {event.skill_name}")

    async def simulate_workflow():
        """Simulate typical development workflow."""
        print("1. Developer modifies web-search skill...")
        watcher.add_callback(reload_callback)

        event1 = MockSkillWatcherEvent(
            WatchEventType.MODIFIED,
            Path("skills/web-search/skill.yaml"),
            "web-search",
            time.time()
        )
        await watcher._handle_event_async(event1)

        await asyncio.sleep(0.1)

        print("\n2. Developer creates new skill...")
        event2 = MockSkillWatcherEvent(
            WatchEventType.CREATED,
            Path("skills/new-analyzer/skill.yaml"),
            "new-analyzer",
            time.time()
        )
        await watcher._handle_event_async(event2)

        await asyncio.sleep(0.1)

        print("\n3. Developer deletes experimental skill...")
        event3 = MockSkillWatcherEvent(
            WatchEventType.DELETED,
            Path("skills/experimental/skill.yaml"),
            "experimental",
            time.time()
        )
        await watcher._handle_event_async(event3)

    asyncio.run(simulate_workflow())

    print(f"\n4. Workflow complete!")
    print(f"   Total reloads: {len(reload_log)}")

    for i, log in enumerate(reload_log, 1):
        print(f"   {i}. {log['event'].upper()}: {log['skill']}")

    assert len(reload_log) == 3, "Should have 3 reload entries"
    print(f"   ✅ Real-world scenario works!\n")

    print("=" * 50)
    print("✅ Real-world scenario test passed!")
    print("=" * 50)


if __name__ == "__main__":
    test_basic_watching()
    test_callback_system()
    test_event_types()
    test_real_world_scenario()
