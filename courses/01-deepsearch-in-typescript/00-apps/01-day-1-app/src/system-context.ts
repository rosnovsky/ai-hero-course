import type { RequestHints } from "~/lib/request-hints";

type QueryResultSearchResult = {
  date: string;
  title: string;
  url: string;
  snippet: string;
};

type QueryResult = {
  query: string;
  results: QueryResultSearchResult[];
};

type ScrapeResult = {
  url: string;
  result: string;
};

const toQueryResult = (
  query: QueryResultSearchResult,
) =>
  [
    `### ${query.date} - ${query.title}`,
    query.url,
    query.snippet,
  ].join("\n\n");

export class SystemContext {
  /**
   * The current step in the loop
   */
  private step = 0;

  /**
   * The user's original question
   */
  private userQuestion = "";

  /**
   * The user's location hints
   */
  private requestHints?: RequestHints;

  /**
   * The history of all queries searched
   */
  private queryHistory: QueryResult[] = [];

  /**
   * The history of all URLs scraped
   */
  private scrapeHistory: ScrapeResult[] = [];

  constructor(userQuestion = "", requestHints?: RequestHints) {
    this.userQuestion = userQuestion;
    this.requestHints = requestHints;
  }

  shouldStop() {
    return this.step >= 10;
  }

  incrementStep() {
    this.step++;
  }

  getStep() {
    return this.step;
  }

  setUserQuestion(question: string) {
    this.userQuestion = question;
  }

  getUserQuestion(): string {
    return this.userQuestion;
  }

  reportQueries(queries: QueryResult[]) {
    this.queryHistory.push(...queries);
  }

  reportScrapes(scrapes: ScrapeResult[]) {
    this.scrapeHistory.push(...scrapes);
  }

  getQueryHistory(): string {
    if (this.queryHistory.length === 0) {
      return "";
    }
    return this.queryHistory
      .map((query) =>
        [
          `## Query: "${query.query}"`,
          ...query.results.map(toQueryResult),
        ].join("\n\n"),
      )
      .join("\n\n");
  }

  getScrapeHistory(): string {
    if (this.scrapeHistory.length === 0) {
      return "";
    }
    return this.scrapeHistory
      .map((scrape) =>
        [
          `## Scrape: "${scrape.url}"`,
          `<scrape_result>`,
          scrape.result,
          `</scrape_result>`,
        ].join("\n\n"),
      )
      .join("\n\n");
  }

  getFullContext(): string {
    const parts = [];

    if (this.userQuestion) {
      parts.push(`## User Question\n${this.userQuestion}`);
    }

    if (this.requestHints && (this.requestHints.latitude || this.requestHints.longitude || this.requestHints.city || this.requestHints.country)) {
      const locationInfo = [
        this.requestHints.latitude && `- lat: ${this.requestHints.latitude}`,
        this.requestHints.longitude && `- lon: ${this.requestHints.longitude}`,
        this.requestHints.city && `- city: ${this.requestHints.city}`,
        this.requestHints.country && `- country: ${this.requestHints.country}`,
      ].filter(Boolean).join("\n");

      parts.push(`## User Location\n${locationInfo}`);
    }

    if (this.queryHistory.length > 0) {
      const queryHistory = this.getQueryHistory();
      parts.push(`## Search History\n${queryHistory}`);
    }

    if (this.scrapeHistory.length > 0) {
      const scrapeHistory = this.getScrapeHistory();
      parts.push(`## Scrape History\n${scrapeHistory}`);
    }

    parts.push(`## Current Step\n${this.step + 1}/10`);

    return parts.join("\n\n");
  }
}
