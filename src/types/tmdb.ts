export type MediaType = 'movie' | 'tv' | 'person';

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBMediaItem {
  id: number;
  media_type?: MediaType;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  profile_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  genres?: TMDBGenre[];
  origin_country?: string[];
  original_language?: string;
  adult?: boolean;
  known_for_department?: string;
  known_for?: TMDBMediaItem[];
  character?: string;
  job?: string;
}

export interface TMDBPaginatedResponse<T = TMDBMediaItem> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TMDBCastMember {
  id: number;
  name: string;
  original_name?: string;
  character: string;
  profile_path: string | null;
  order: number;
  known_for_department?: string;
}

export interface TMDBCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface TMDBVideo {
  id: string;
  iso_639_1: string;
  iso_3166_1: string;
  key: string;
  name: string;
  site: string;
  size: number;
  type: string;
  official: boolean;
  published_at?: string;
}

export interface TMDBProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
  origin_country: string;
}

export interface TMDBProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface TMDBSpokenLanguage {
  iso_639_1: string;
  english_name: string;
  name: string;
}

export interface TMDBSeasonSummary {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  season_number: number;
  episode_count: number;
  air_date: string | null;
  vote_average?: number;
}

export interface TMDBEpisode {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  air_date: string | null;
  still_path: string | null;
  runtime: number | null;
  vote_average: number;
  vote_count: number;
}

export interface TMDBSeasonDetail {
  _id: string;
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  season_number: number;
  air_date: string | null;
  episodes: TMDBEpisode[];
}

export interface TMDBReleaseDatesResult {
  iso_3166_1: string;
  release_dates: Array<{
    certification: string;
    release_date: string;
    type: number;
  }>;
}

export interface TMDBContentRatingResult {
  iso_3166_1: string;
  rating: string;
}

export interface TMDBMediaDetail extends TMDBMediaItem {
  imdb_id?: string | null;
  external_ids?: {
    imdb_id?: string | null;
  };
  tagline?: string;
  status?: string;
  runtime?: number | null;
  episode_run_time?: number[];
  budget?: number;
  revenue?: number;
  homepage?: string;
  in_production?: boolean;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: TMDBSeasonSummary[];
  created_by?: Array<{ id: number; name: string; profile_path: string | null }>;
  production_companies?: TMDBProductionCompany[];
  production_countries?: TMDBProductionCountry[];
  spoken_languages?: TMDBSpokenLanguage[];
  belongs_to_collection?: {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
  } | null;
  credits?: {
    cast: TMDBCastMember[];
    crew: TMDBCrewMember[];
  };
  videos?: {
    results: TMDBVideo[];
  };
  recommendations?: TMDBPaginatedResponse<TMDBMediaItem>;
  similar?: TMDBPaginatedResponse<TMDBMediaItem>;
  release_dates?: {
    results: TMDBReleaseDatesResult[];
  };
  content_ratings?: {
    results: TMDBContentRatingResult[];
  };
}

export interface TMDBPersonDetail {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  also_known_as?: string[];
  combined_credits?: {
    cast: TMDBMediaItem[];
    crew: TMDBMediaItem[];
  };
}

export interface TMDBCollectionDetail {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: TMDBMediaItem[];
}

export interface DiscoverFilterParams {
  genre?: string;
  withoutGenres?: string;
  year?: string;
  decade?: string;
  minRating?: string;
  minVotes?: string;
  language?: string;
  country?: string;
  sortBy?: string;
  status?: string;
  page?: number;
}

export type PageRouteId =
  | 'home'
  | 'movies'
  | 'series'
  | 'animes'
  | 'doramas'
  | 'documentaries'
  | 'sessao-flix'
  | 'search'
  | 'my-flix'
  | 'my-account'
  | 'detail'
  | 'person'
  | 'collection';

export const MOVIE_GENRES: TMDBGenre[] = [
  { id: 28, name: 'Ação' },
  { id: 12, name: 'Aventura' },
  { id: 16, name: 'Animação' },
  { id: 35, name: 'Comédia' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentário' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Família' },
  { id: 14, name: 'Fantasia' },
  { id: 36, name: 'História' },
  { id: 27, name: 'Terror' },
  { id: 10402, name: 'Música' },
  { id: 9648, name: 'Mistério' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Ficção Científica' },
  { id: 53, name: 'Suspense' },
  { id: 10752, name: 'Guerra' },
  { id: 37, name: 'Faroeste' },
];

export const TV_GENRES: TMDBGenre[] = [
  { id: 10759, name: 'Ação e Aventura' },
  { id: 16, name: 'Animação' },
  { id: 35, name: 'Comédia' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentário' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Família' },
  { id: 10762, name: 'Infantil' },
  { id: 9648, name: 'Mistério' },
  { id: 10765, name: 'Sci-Fi & Fantasia' },
  { id: 10766, name: 'Novela' },
  { id: 10768, name: 'Guerra & Política' },
  { id: 37, name: 'Faroeste' },
];

export const ALL_GENRES_MAP: Record<number, string> = [...MOVIE_GENRES, ...TV_GENRES].reduce(
  (acc, g) => {
    acc[g.id] = g.name;
    return acc;
  },
  {} as Record<number, string>
);

export const COUNTRIES_LIST = [
  { code: 'BR', name: 'Brasil' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'JP', name: 'Japão' },
  { code: 'KR', name: 'Coreia do Sul' },
  { code: 'GB', name: 'Reino Unido' },
  { code: 'FR', name: 'França' },
  { code: 'ES', name: 'Espanha' },
  { code: 'DE', name: 'Alemanha' },
  { code: 'IT', name: 'Itália' },
  { code: 'CN', name: 'China' },
  { code: 'CA', name: 'Canadá' },
  { code: 'MX', name: 'México' },
  { code: 'AR', name: 'Argentina' },
  { code: 'IN', name: 'Índia' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TH', name: 'Tailândia' },
];

export const LANGUAGES_LIST = [
  { code: 'pt', name: 'Português' },
  { code: 'en', name: 'Inglês' },
  { code: 'ja', name: 'Japonês' },
  { code: 'ko', name: 'Coreano' },
  { code: 'es', name: 'Espanhol' },
  { code: 'fr', name: 'Francês' },
  { code: 'de', name: 'Alemão' },
  { code: 'it', name: 'Italiano' },
  { code: 'zh', name: 'Chinês / Mandarim' },
  { code: 'hi', name: 'Hindi' },
  { code: 'th', name: 'Tailandês' },
];

export const DECADES_LIST = [
  { label: 'Anos 2020', start: '2020-01-01', end: '2029-12-31', value: '2020' },
  { label: 'Anos 2010', start: '2010-01-01', end: '2019-12-31', value: '2010' },
  { label: 'Anos 2000', start: '2000-01-01', end: '2009-12-31', value: '2000' },
  { label: 'Anos 1990', start: '1990-01-01', end: '1999-12-31', value: '1990' },
  { label: 'Anos 1980', start: '1980-01-01', end: '1989-12-31', value: '1980' },
  { label: 'Anos 1970', start: '1970-01-01', end: '1979-12-31', value: '1970' },
  { label: 'Clássicos (<1970)', start: '1920-01-01', end: '1969-12-31', value: 'classic' },
];

export const POPULAR_COLLECTION_IDS = [
  { id: 726871, fallbackName: 'Coleção Duna' },
  { id: 404609, fallbackName: 'Coleção John Wick' },
  { id: 119, fallbackName: 'O Senhor dos Anéis' },
  { id: 531241, fallbackName: 'Homem-Aranha (Aranhaverso)' },
  { id: 87359, fallbackName: 'Missão: Impossível' },
  { id: 313086, fallbackName: 'Invocação do Mal' },
  { id: 263, fallbackName: 'Batman: O Cavaleiro das Trevas' },
  { id: 10, fallbackName: 'Star Wars' },
];

export const STUDIO_AVATARS = [
  {
    id: 'crimson',
    label: 'Cinéfila Carmesim',
    src: '/src/assets/images/avatar_crimson_cinema_1793457908357.jpg',
  },
  {
    id: 'director',
    label: 'Diretor Noir',
    src: '/src/assets/images/avatar_noir_director_1793457909680.jpg',
  },
  {
    id: 'anime',
    label: 'Protagonista Anime',
    src: '/src/assets/images/avatar_anime_enthusiast_1793457910827.jpg',
  },
  {
    id: 'scifi',
    label: 'Exploradora Sci-Fi',
    src: '/src/assets/images/avatar_scifi_explorer_1793457910486.jpg',
  },
];
