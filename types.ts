
export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
  scenario: string;
  movieTitle: string;
  actor: string;
}

export interface Scenario {
  movieTitle: string;
  description: string;
  actor: string;
}
