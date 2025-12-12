// Example: ?orderby=price&order=asc

export function useSorting() {
  const route = useRoute();
  const router = useRouter();
  const { updateProductList } = useProducts();

  // Track whether sorting should be applied based on the current route query.
  // NOTE: We must consider BOTH `orderby` and `order`.
  // Previously this state only tracked `orderby`, which broke cases where users
  // only changed `order` (ASC/DESC) and expected reactivity.
  const orderQuery = useState<{ orderBy: string; order: string }>('order', () => ({ orderBy: '', order: '' }));

  watch(
    () => [route.query.orderby, route.query.order],
    ([orderby, order]) => {
      orderQuery.value = {
        orderBy: (orderby as string) ?? '',
        order: (order as string) ?? '',
      };
    },
    { immediate: true },
  );

  function getOrderQuery(): { orderBy: string; order: string } {
    return { orderBy: route.query.orderby as string, order: route.query.order as string };
  }

  function setOrderQuery(orderby: string, order?: string): void {
    router.push({ query: { ...route.query, orderby: orderby ?? undefined, order: order ?? undefined } });
    setTimeout(() => {
      updateProductList();
    }, 100);
  }

  const isSortingActive = computed<boolean>(() => !!(orderQuery.value.orderBy || orderQuery.value.order));

  // Define a function to order the products
  function sortProducts(products: Product[]): Product[] {
    if (!isSortingActive.value) return products;

    const orderQuery = getOrderQuery();

    if (!orderQuery.orderBy && !orderQuery.order) return products;

    const orderby: string = orderQuery.orderBy || 'date';
    const order: string = (orderQuery.order || 'DESC').toUpperCase();

    const parsePriceNumber = (value: unknown): number => {
      if (value == null) return 0;
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      const cleaned = String(value)
        .replace(/<[^>]*>/g, '')
        .replace(/&[^;]+;/g, ' ')
        .replace(/[^0-9.,-]/g, '')
        .trim();
      if (!cleaned) return 0;
      // Handle commas used as thousands separators by removing them.
      const normalized = cleaned.replace(/,/g, '');
      const parsed = parseFloat(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return products.sort((a: Product, b: Product) => {
      // Format values for sorting
      const dateValue = (p: any): number => {
        const candidate = p?.date ?? p?.modified ?? p?.createdAt ?? p?.created ?? p?.updatedAt ?? p?.updated;
        // If the object doesn't have any date-like field (common in the search list JSON),
        // fall back to `databaseId` as a proxy for recency.
        if (!candidate) {
          const id = Number(p?.databaseId ?? p?.id ?? 0);
          return Number.isFinite(id) ? id : 0;
        }
        const time = new Date(candidate).getTime();
        return Number.isFinite(time) ? time : 0;
      };

      const aDate: number = dateValue(a as any);
      const bDate: number = dateValue(b as any);
      // Search results (Fuse/KV/local list) use `price`/`regularPrice`/`salePrice` as plain strings.
      // Category/products pages often use `rawPrice`/`rawSalePrice`/`rawRegularPrice`.
      const aPrice = parsePriceNumber((a as any).price ?? (a as any).rawPrice);
      const bPrice = parsePriceNumber((b as any).price ?? (b as any).rawPrice);
      const aSalePrice: number = parsePriceNumber((a as any).salePrice ?? (a as any).rawSalePrice);
      const aRegularPrice: number = parsePriceNumber((a as any).regularPrice ?? (a as any).rawRegularPrice);
      const bSalePrice: number = parsePriceNumber((b as any).salePrice ?? (b as any).rawSalePrice);
      const bRegularPrice: number = parsePriceNumber((b as any).regularPrice ?? (b as any).rawRegularPrice);
      const aDiscount: number = a.onSale ? Math.round(((aSalePrice - aRegularPrice) / aRegularPrice) * 100) : 0;
      const bDiscount: number = b.onSale ? Math.round(((bSalePrice - bRegularPrice) / bRegularPrice) * 100) : 0;
      const aName: string = a.name || '';
      const bName: string = b.name || '';
      // Search list JSON often has no rating fields at all.
      // If missing, keep 0 and later push unrated items to the end.
      const aRating: number = Number((a as any).averageRating ?? (a as any).rating ?? 0) || 0;
      const bRating: number = Number((b as any).averageRating ?? (b as any).rating ?? 0) || 0;
      const aReviewCount: number = Number((a as any).reviewCount ?? 0) || 0;
      const bReviewCount: number = Number((b as any).reviewCount ?? 0) || 0;

      switch (orderby) {
        case 'price':
          return order !== 'DESC' ? aPrice - bPrice : bPrice - aPrice;
        case 'rating':
          // Prefer items with real rating/reviews first; otherwise keep them at the end.
          // Primary: average rating, Secondary: review count.
          if (aRating === 0 && bRating !== 0) return 1;
          if (bRating === 0 && aRating !== 0) return -1;
          if (aRating !== bRating) return order !== 'DESC' ? bRating - aRating : aRating - bRating;
          return order !== 'DESC' ? bReviewCount - aReviewCount : aReviewCount - bReviewCount;
        case 'discount':
          // Higher discount first when ASC, lower discount first when DESC.
          // (Matches existing dropdown semantics in this codebase.)
          return order !== 'DESC' ? bDiscount - aDiscount : aDiscount - bDiscount;
        case 'alphabetically':
          return order !== 'DESC' ? aName.localeCompare(bName) : bName.localeCompare(aName);
        default:
          return order !== 'DESC' ? aDate - bDate : bDate - aDate;
      }
    });
  }

  return { getOrderQuery, setOrderQuery, isSortingActive, orderQuery, sortProducts };
}
