do $$ begin
  alter table public.product_feed_links
    add constraint product_feed_links_product_id_fkey
    foreign key (product_id) references public.products(id) on delete cascade;
exception when duplicate_object then null; end $$;
