import { Controller, Get, Query, UseGuards, Request } from "@nestjs/common";
import { SearchService } from "./search.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("search")
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Query("q") query: string,
    @Request() req: any,
    @Query("type") type?: "all" | "boards" | "cards" | "lists",
  ) {
    if (!query || query.trim().length < 2) {
      return {
        boards: [],
        lists: [],
        cards: [],
      };
    }

    return this.searchService.search(query, req.user.id, type);
  }

  @Get("recent")
  async getRecentSearches(@Request() req: any) {
    return this.searchService.getRecentSearches(req.user.id);
  }

  @Get("suggestions")
  async getSuggestions(@Query("q") query: string, @Request() req: any) {
    if (!query || query.trim().length < 1) {
      return [];
    }

    return this.searchService.getSuggestions(query, req.user.id);
  }
}
