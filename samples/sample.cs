using System;
using System.Collections.Generic;
using System.Linq;

namespace AwapiEditor.Samples
{
    public record Book(string Isbn, string Title, string Author, int Year, decimal Price);

    public sealed class LibraryCatalog
    {
        private readonly List<Book> _books = new();

        public void AddBook(Book book)
        {
            ArgumentNullException.ThrowIfNull(book);
            _books.Add(book);
        }

        public IReadOnlyList<Book> SearchByAuthor(string authorQuery)
        {
            if (string.IsNullOrWhiteSpace(authorQuery))
            {
                return Array.Empty<Book>();
            }

            return _books
                .Where(b => b.Author.Contains(authorQuery, StringComparison.OrdinalIgnoreCase))
                .OrderBy(b => b.Year)
                .ToList();
        }

        public decimal CalculateAveragePrice() =>
            _books.Count == 0 ? 0m : Math.Round(_books.Average(b => b.Price), 2);
    }

    public static class Program
    {
        public static void Main()
        {
            var catalog = new LibraryCatalog();
            catalog.AddBook(new Book("978-0132350884", "Clean Code", "Robert C. Martin", 2008, 39.99m));
            catalog.AddBook(new Book("978-0201616224", "The Pragmatic Programmer", "Andrew Hunt", 1999, 44.50m));
            catalog.AddBook(new Book("978-1492051367", "Designing Data-Intensive Applications", "Martin Kleppmann", 2017, 49.99m));

            Console.WriteLine($"Average book price: ${catalog.CalculateAveragePrice():F2}");

            foreach (var match in catalog.SearchByAuthor("Martin"))
            {
                Console.WriteLine($"- {match.Title} ({match.Year}) by {match.Author}");
            }
        }
    }
}
