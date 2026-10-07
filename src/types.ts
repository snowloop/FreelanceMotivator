export interface Task {
  content: string;
  due: string | null;
  priority: number;
}

export interface FeedItem {
  title: string;
  link: string;
  date: string | null;
  summary: string;
}
