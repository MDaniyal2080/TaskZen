export const notificationTemplates = {
  welcome: (username: string) => ({
    subject: "Welcome to TaskZen!",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to TaskZen!</h1>
            </div>
            <div class="content">
              <h2>Hi ${username},</h2>
              <p>Welcome to TaskZen, your new productivity companion! We're excited to have you on board.</p>
              <p>With TaskZen, you can:</p>
              <ul>
                <li>Create and manage Kanban boards</li>
                <li>Collaborate with your team in real-time</li>
                <li>Track tasks with labels and due dates</li>
                <li>Attach files and add comments</li>
                <li>View your tasks in calendar view</li>
              </ul>
              <a href="${process.env.CLIENT_URL}/boards" class="button">Get Started</a>
              <p>If you have any questions, feel free to reach out to our support team.</p>
              <p>Best regards,<br>The TaskZen Team</p>
            </div>
            <div class="footer">
              <p>&copy; 2024 TaskZen. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Welcome to TaskZen!
      
      Hi ${username},
      
      Welcome to TaskZen, your new productivity companion! We're excited to have you on board.
      
      Get started at: ${process.env.CLIENT_URL}/boards
      
      Best regards,
      The TaskZen Team
    `,
  }),

  boardInvite: (
    inviterName: string,
    boardName: string,
    inviteLink: string,
  ) => ({
    subject: `${inviterName} invited you to join "${boardName}" on TaskZen`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Board Invitation</h1>
            </div>
            <div class="content">
              <p><strong>${inviterName}</strong> has invited you to collaborate on the board <strong>"${boardName}"</strong> on TaskZen.</p>
              <a href="${inviteLink}" class="button">Accept Invitation</a>
              <p>This invitation will expire in 7 days.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `${inviterName} invited you to join "${boardName}" on TaskZen. Accept invitation: ${inviteLink}`,
  }),

  taskAssigned: (
    assigneeName: string,
    taskTitle: string,
    boardName: string,
    taskLink: string,
  ) => ({
    subject: `You've been assigned to "${taskTitle}"`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Task Assignment</h1>
            </div>
            <div class="content">
              <p>Hi ${assigneeName},</p>
              <p>You've been assigned to a new task:</p>
              <h3>${taskTitle}</h3>
              <p>Board: ${boardName}</p>
              <a href="${taskLink}" class="button">View Task</a>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `You've been assigned to "${taskTitle}" in ${boardName}. View task: ${taskLink}`,
  }),

  dueDateReminder: (taskTitle: string, dueDate: string, taskLink: string) => ({
    subject: `Reminder: "${taskTitle}" is due soon`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #EF4444; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #EF4444; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Task Due Date Reminder</h1>
            </div>
            <div class="content">
              <p>This is a reminder that the following task is due soon:</p>
              <h3>${taskTitle}</h3>
              <p><strong>Due Date:</strong> ${dueDate}</p>
              <a href="${taskLink}" class="button">View Task</a>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Reminder: "${taskTitle}" is due on ${dueDate}. View task: ${taskLink}`,
  }),

  comment: (
    commenterName: string,
    taskTitle: string,
    comment: string,
    taskLink: string,
  ) => ({
    subject: `${commenterName} commented on "${taskTitle}"`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
            .comment { background: white; padding: 15px; border-left: 3px solid #4F46E5; margin: 15px 0; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Comment</h1>
            </div>
            <div class="content">
              <p><strong>${commenterName}</strong> commented on <strong>"${taskTitle}"</strong>:</p>
              <div class="comment">${comment}</div>
              <a href="${taskLink}" class="button">View Task</a>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `${commenterName} commented on "${taskTitle}": ${comment}. View task: ${taskLink}`,
  }),
};
