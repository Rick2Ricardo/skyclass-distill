from app.frame_extractor import cue_timestamps, plan_frame_timestamps


def test_keyframe_plan_prioritizes_visual_cues_and_stays_bounded():
    transcript = {
        "segments": [
            {"start": 10, "end": 12, "text": "请看这个坐标图"},
            {"start": 70, "end": 72, "text": "观察实验现象"},
        ]
    }

    plan = plan_frame_timestamps(transcript, 120, [30, 60, 90], max_frames=5)

    assert cue_timestamps(transcript) == [10.5, 70.5]
    assert len(plan) <= 5
    assert plan == sorted(plan, key=lambda item: item["timestamp"])
    assert sum(item["selection_reason"] == "transcript_cue" for item in plan) == 2


def test_keyframe_plan_deduplicates_nearby_candidates():
    transcript = {"segments": [{"start": 10, "text": "请看图像"}]}

    plan = plan_frame_timestamps(transcript, 30, [11, 12], max_frames=20)

    nearby = [item for item in plan if 8 <= item["timestamp"] <= 14]
    assert len(nearby) == 1
