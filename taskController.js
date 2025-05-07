// taskController.js

function createTask(req, res, connection) {
    const itemName = req.body.newItem;
    const description = req.body.description || null;
    const dueDate = req.body.due_date || null;
    const userId = req.session.userId;

    connection.query(
        "INSERT INTO items (name, description, due_date, user_id) VALUES (?, ?, ?, ?)",
        [itemName, description, dueDate, userId],
        (err) => {
            if (err) throw err;
            res.redirect("/");
        }
    );
}

module.exports = {
    createTask
}; 