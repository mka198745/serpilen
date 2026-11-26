CREATE TABLE `order_number_reservations` (
  `token` text PRIMARY KEY NOT NULL,
  `order_number` text NOT NULL UNIQUE,
  `used` integer NOT NULL DEFAULT 0
);
