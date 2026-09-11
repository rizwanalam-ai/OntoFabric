const confidentialKeysByRole = {
    ADMIN: new Set(),
    ANALYST: new Set(['ssn', 'salary', 'baseSalary', 'socialSecurityNumber']),
    GUEST: new Set(['ssn', 'salary', 'baseSalary', 'socialSecurityNumber', 'email', 'phone', 'address'])
};
export const getUserRole = (request) => {
    const role = request.header('x-user-role')?.toUpperCase();
    return role === 'ADMIN' || role === 'ANALYST' || role === 'GUEST' ? role : 'GUEST';
};
export const redactNodeProperties = (nodes, userRole) => {
    const role = userRole.toUpperCase();
    const restrictedKeys = confidentialKeysByRole[role] ?? confidentialKeysByRole.GUEST;
    return nodes.map((node) => {
        const properties = Object.fromEntries(Object.entries(node.properties).filter(([key]) => !restrictedKeys.has(key) && !restrictedKeys.has(key.toLowerCase())));
        return { ...node, properties };
    });
};
export const abacMiddleware = (request, response, next) => {
    response.locals.userRole = getUserRole(request);
    next();
};
//# sourceMappingURL=abacMiddleware.js.map