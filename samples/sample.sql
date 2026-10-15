-- Awapi Editor Sample SQL Script
-- Schema and reporting queries for an order management system

CREATE TABLE Customers (
    CustomerId INT PRIMARY KEY,
    FullName NVARCHAR(120) NOT NULL,
    Email NVARCHAR(255) NOT NULL UNIQUE,
    Region NVARCHAR(50) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Orders (
    OrderId INT PRIMARY KEY,
    CustomerId INT NOT NULL,
    OrderDate DATE NOT NULL,
    Status VARCHAR(20) NOT NULL CHECK (Status IN ('Pending', 'Paid', 'Shipped', 'Cancelled')),
    TotalAmount DECIMAL(12, 2) NOT NULL,
    CONSTRAINT FK_Orders_Customers FOREIGN KEY (CustomerId) REFERENCES Customers (CustomerId)
);

INSERT INTO Customers (CustomerId, FullName, Email, Region)
VALUES
    (1, 'Alice Johnson', 'alice@example.com', 'North America'),
    (2, 'Bob Smith', 'bob@example.com', 'North America'),
    (3, 'Clara Oswald', 'clara@example.com', 'Europe');

INSERT INTO Orders (OrderId, CustomerId, OrderDate, Status, TotalAmount)
VALUES
    (1001, 1, '2026-09-15', 'Shipped', 249.99),
    (1002, 1, '2026-10-02', 'Paid', 89.50),
    (1003, 2, '2026-10-08', 'Pending', 540.00),
    (1004, 3, '2026-10-12', 'Shipped', 129.00);

-- Top customers by revenue (excluding cancelled orders)
SELECT
    c.CustomerId,
    c.FullName,
    c.Region,
    COUNT(o.OrderId) AS OrderCount,
    SUM(o.TotalAmount) AS LifetimeRevenue
FROM Customers AS c
INNER JOIN Orders AS o
    ON o.CustomerId = c.CustomerId
WHERE o.Status <> 'Cancelled'
GROUP BY
    c.CustomerId,
    c.FullName,
    c.Region
ORDER BY LifetimeRevenue DESC;
