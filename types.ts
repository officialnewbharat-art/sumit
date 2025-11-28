export enum AppStep {
  FORM = 'FORM',
  INSTRUCTIONS = 'INSTRUCTIONS',
  INTERVIEW = 'INTERVIEW',
  EVALUATING = 'EVALUATING',
  RESULT = 'RESULT',
}

export interface CandidateInfo {
  name: string;
  jobDescription: string;
  field: string;
  language: string;
}

export interface QuestionReview {
  question: string;
  candidateAnswerSummary: string;
  rating: number; // 1-10
  feedback: string;
}

export interface InterviewResult {
  rating: number; // 1-10
  feedback: string;
  passed: boolean;
  questions?: QuestionReview[];
  terminationReason?: string; // e.g., "Cheating Detected"
}