import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../config/database';
import { env } from '../config/env';

export const register = async (req: Request, res: Response) => {
  try {
    const { email, phoneNumber, password, name, role, workplace, staffCode, birthdate, gender, address } = req.body;
    const db = getDb();

    // Không cho phép tự đăng ký quyền admin
    if (role === 'admin') {
      return res.status(403).json({ message: 'Không thể tự đăng ký tài khoản Quản trị viên.' });
    }

    // Kiểm tra trùng Email hoặc SĐT
    const existing = await db.collection('users').findOne({
      $or: [{ email }, { phoneNumber }]
    });

    if (existing) {
      return res.status(400).json({ message: 'Email hoặc Số điện thoại đã được đăng ký.' });
    }

    if (role === 'doctor' && staffCode) {
      const existingStaff = await db.collection('users').findOne({ staffCode });
      if (existingStaff) {
        return res.status(400).json({ message: 'Mã cán bộ y tế đã tồn tại.' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = {
      name,
      email,
      phoneNumber,
      password: passwordHash,
      role: role || 'user',
      status: 'active',
      birthdate,
      gender,
      address,
      workplace: role === 'doctor' ? workplace : null,
      staffCode: role === 'doctor' ? staffCode : null,
      createdAt: new Date()
    };

    const result = await db.collection('users').insertOne(newUser);

    // Ghi audit log
    await db.collection('activity_logs').insertOne({
      userId: result.insertedId.toString(),
      actionType: 'REGISTER',
      targetTable: 'users',
      targetId: result.insertedId.toString(),
      description: `Người dùng ${email} đăng ký vai trò ${newUser.role}`,
      createdAt: new Date()
    });

    return res.status(201).json({
      message: 'Tài khoản được tạo thành công.',
      userId: result.insertedId
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Lỗi server.', error: error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;
    const db = getDb();

    const user = await db.collection('users').findOne({
      $or: [{ email: identifier }, { phoneNumber: identifier }]
    });

    if (!user) {
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
    }

    if (user.status === 'locked') {
      return res.status(403).json({ message: 'Tài khoản của bạn đã bị khóa.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
    }

    // JWT hạn 30 phút theo yêu cầu phi chức năng
    const token = jwt.sign(
      { userId: user._id.toString(), role: user.role },
      env.JWT_SECRET,
      { expiresIn: '30m' }
    );

    // Lưu phiên làm việc
    await db.collection('user_sessions').insertOne({
      userId: user._id.toString(),
      tokenHash: bcrypt.hashSync(token, 5),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    return res.status(200).json({
      token,
      user: {
        userId: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Lỗi hệ thống.', error: error.message });
  }
};