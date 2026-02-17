/**
 * Pagination utility for Sequelize queries
 */
const getPagination = (page, limit) => {
    const p = parseInt(page, 10) || 1;
    const l = parseInt(limit, 10) || 10;
    const offset = (p - 1) * l;

    return { limit: l, offset };
};

const getPagingData = (data, page, limit) => {
    const { count: totalItems, rows: items } = data;
    const currentPage = parseInt(page, 10) || 1;
    const l = parseInt(limit, 10) || 10;
    const totalPages = Math.ceil(totalItems / l);

    return {
        totalItems,
        items,
        totalPages,
        currentPage
    };
};

module.exports = { getPagination, getPagingData };
