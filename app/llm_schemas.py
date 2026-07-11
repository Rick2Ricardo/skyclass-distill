from __future__ import annotations

from pydantic import BaseModel, Field


class LessonFlowStep(BaseModel):
    phase: str = Field(min_length=1)
    teacher_action: str = Field(min_length=1)
    suggested_language: str = Field(min_length=1)
    expected_student_response: str = Field(min_length=1)
    if_student_struggles: str = Field(min_length=1)


class AssessmentCheckpoint(BaseModel):
    check: str = Field(min_length=1)
    success_signal: str = Field(min_length=1)
    next_move_if_not: str = Field(min_length=1)


class LearnerAdaptation(BaseModel):
    learner_signal: str = Field(min_length=1)
    adjustment: str = Field(min_length=1)


class TeacherGuide(BaseModel):
    lesson_flow: list[LessonFlowStep] = Field(min_length=4, max_length=6)
    assessment_checkpoints: list[AssessmentCheckpoint] = Field(min_length=2, max_length=4)
    adaptations: list[LearnerAdaptation] = Field(min_length=2)
